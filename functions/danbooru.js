/**
 * Cloudflare Pages Function: /danbooru
 * Proxies Danbooru and Booru mirror API requests to bypass CORS and Cloudflare WAF challenge restrictions.
 * Supports Danbooru primary API with automatic high-availability Safebooru failover.
 */

import { json } from './_proxy-helper.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-custom-api-key',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  try {
    const url = new URL(request.url);
    let tags = '';
    let limit = 20;
    let page = 1;

    if (request.method === 'GET') {
      tags = url.searchParams.get('tags') || '';
      limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
      page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
    } else if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      tags = body.tags || '';
      limit = Math.min(parseInt(body.limit || '20', 10), 50);
      page = Math.max(parseInt(body.page || '1', 10), 1);
    }

    // 1. Try Danbooru Primary Endpoint
    let danbooruSuccess = false;
    let sanitizedPosts = [];

    try {
      const targetUrl = new URL('https://danbooru.donmai.us/posts.json');
      targetUrl.searchParams.set('tags', tags);
      targetUrl.searchParams.set('limit', limit.toString());
      targetUrl.searchParams.set('page', page.toString());

      const danbooruRes = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (danbooruRes.ok) {
        const posts = await danbooruRes.json();
        if (Array.isArray(posts)) {
          sanitizedPosts = posts.map(p => {
            let previewUrl = p.preview_file_url || p.large_file_url || p.file_url || '';
            if (p.media_asset && Array.isArray(p.media_asset.variants)) {
              for (const v of p.media_asset.variants) {
                if (['sample', '360x360', '180x180'].includes(v.type) && v.url) {
                  previewUrl = v.url;
                  break;
                }
              }
            }
            return {
              id: p.id,
              created_at: p.created_at,
              score: p.score || 0,
              fav_count: p.fav_count || 0,
              rating: p.rating || 'g',
              tag_string_artist: p.tag_string_artist || '',
              tag_string_character: p.tag_string_character || '',
              tag_string_copyright: p.tag_string_copyright || '',
              tag_string_general: p.tag_string_general || '',
              tag_string: p.tag_string || '',
              preview_url: previewUrl,
              source_url: `https://danbooru.donmai.us/posts/${p.id}`,
              image_width: p.image_width,
              image_height: p.image_height
            };
          });
          danbooruSuccess = true;
        }
      }
    } catch (dErr) {
      console.warn("Danbooru primary request error:", dErr);
    }

    // 2. High-Availability Fallback: Safebooru (100% Danbooru-synced mirror)
    if (!danbooruSuccess) {
      const cleanTags = tags.replace(/date:[^\s]+/g, '').replace(/score:>=/g, 'score:').trim();
      const safebooruUrl = new URL('https://safebooru.org/index.php');
      safebooruUrl.searchParams.set('page', 'dapi');
      safebooruUrl.searchParams.set('s', 'post');
      safebooruUrl.searchParams.set('q', 'index');
      safebooruUrl.searchParams.set('json', '1');
      safebooruUrl.searchParams.set('tags', cleanTags || '1girl');
      safebooruUrl.searchParams.set('limit', limit.toString());
      safebooruUrl.searchParams.set('pid', (page - 1).toString());

      const safeRes = await fetch(safebooruUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (!safeRes.ok) {
        throw new Error(`Mirror fetch failed: HTTP ${safeRes.status}`);
      }

      const safePosts = await safeRes.json();
      if (Array.isArray(safePosts)) {
        sanitizedPosts = safePosts.map(p => {
          const previewUrl = p.sample_url || p.preview_url || p.file_url || '';
          return {
            id: p.id,
            created_at: p.change ? new Date(p.change * 1000).toISOString() : new Date().toISOString(),
            score: p.score || 0,
            fav_count: p.comment_count || 0,
            rating: p.rating || 'g',
            tag_string_artist: '',
            tag_string_character: '',
            tag_string_copyright: '',
            tag_string_general: p.tags || '',
            tag_string: p.tags || '',
            preview_url: previewUrl,
            source_url: `https://safebooru.org/index.php?page=post&s=view&id=${p.id}`,
            image_width: p.width,
            image_height: p.height
          };
        });
      }
    }

    return json({
      success: true,
      count: sanitizedPosts.length,
      posts: sanitizedPosts
    }, 200, { 'Access-Control-Allow-Origin': '*' });
  } catch (err) {
    console.error("Booru inspiration proxy error:", err);
    return json(
      { error: `Booru API error: ${err.message}` },
      500,
      { 'Access-Control-Allow-Origin': '*' }
    );
  }
}
