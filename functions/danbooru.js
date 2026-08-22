/**
 * Cloudflare Pages Function: /danbooru
 * High-Availability Multi-Source Real-Time Booru Gateway
 * Queries Danbooru -> Safebooru -> TBIB -> Yande in real-time
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

  let tags = '';
  let limit = 20;
  let page = 1;

  try {
    const url = new URL(request.url);
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
  } catch (e) {
    // Ignore URL parse error
  }

  const cleanTags = tags.replace(/date:[^\s]+/g, '').replace(/score:>=/g, 'score:').trim() || '1girl';
  let sanitizedPosts = [];

  // 1. 尝试 Danbooru 官方全量接口
  try {
    const targetUrl = new URL('https://danbooru.donmai.us/posts.json');
    targetUrl.searchParams.set('tags', tags || cleanTags);
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
      if (Array.isArray(posts) && posts.length > 0) {
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
            created_at: p.created_at || (p.change ? new Date(p.change * 1000).toISOString() : ''),
            score: p.score || 0,
            fav_count: p.fav_count || 0,
            rating: p.rating || 'g',
            tag_string_artist: p.tag_string_artist || '',
            tag_string_character: p.tag_string_character || '',
            tag_string_copyright: p.tag_string_copyright || '',
            tag_string_general: p.tag_string_general || p.tag_string || '',
            tag_string: p.tag_string || '',
            preview_url: previewUrl,
            source_url: `https://danbooru.donmai.us/posts/${p.id}`,
            image_width: p.image_width || 832,
            image_height: p.image_height || 1216
          };
        });
      }
    }
  } catch (dErr) {
    console.warn("[Danbooru Proxy] Danbooru fetch failed:", dErr);
  }

  // 2. 备选尝试 Safebooru 实时接口 (支持绝大多数作品与角色标签)
  if (sanitizedPosts.length === 0) {
    try {
      const safebooruUrl = new URL('https://safebooru.org/index.php');
      safebooruUrl.searchParams.set('page', 'dapi');
      safebooruUrl.searchParams.set('s', 'post');
      safebooruUrl.searchParams.set('q', 'index');
      safebooruUrl.searchParams.set('json', '1');
      safebooruUrl.searchParams.set('tags', cleanTags);
      safebooruUrl.searchParams.set('limit', limit.toString());
      safebooruUrl.searchParams.set('pid', Math.max(0, page - 1).toString());

      const safeRes = await fetch(safebooruUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (safeRes.ok) {
        const safePosts = await safeRes.json();
        if (Array.isArray(safePosts) && safePosts.length > 0) {
          sanitizedPosts = safePosts.map(p => ({
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
            preview_url: p.sample_url || p.preview_url || p.file_url || '',
            source_url: `https://safebooru.org/index.php?page=post&s=view&id=${p.id}`,
            image_width: p.width || 832,
            image_height: p.height || 1216
          }));
        }
      }
    } catch (sErr) {
      console.warn("[Danbooru Proxy] Safebooru fetch failed:", sErr);
    }
  }

  // 2. 次选尝试 TBIB (The Big Idol Booru)
  if (sanitizedPosts.length === 0) {
    try {
      const tbibUrl = new URL('https://tbib.org/index.php');
      tbibUrl.searchParams.set('page', 'dapi');
      tbibUrl.searchParams.set('s', 'post');
      tbibUrl.searchParams.set('q', 'index');
      tbibUrl.searchParams.set('json', '1');
      tbibUrl.searchParams.set('tags', cleanTags);
      tbibUrl.searchParams.set('limit', limit.toString());
      tbibUrl.searchParams.set('pid', Math.max(0, page - 1).toString());

      const tbibRes = await fetch(tbibUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (tbibRes.ok) {
        const tbibPosts = await tbibRes.json();
        if (Array.isArray(tbibPosts) && tbibPosts.length > 0) {
          sanitizedPosts = tbibPosts.map(p => ({
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
            preview_url: p.sample_url || p.preview_url || p.file_url || '',
            source_url: `https://tbib.org/index.php?page=post&s=view&id=${p.id}`,
            image_width: p.width || 832,
            image_height: p.height || 1216
          }));
        }
      }
    } catch (tErr) {
      console.warn("[Danbooru Proxy] TBIB fetch failed:", tErr);
    }
  }

  // 3. 次选尝试 Yande.re 实时接口
  if (sanitizedPosts.length === 0) {
    try {
      const yandeUrl = new URL('https://yande.re/post.json');
      yandeUrl.searchParams.set('tags', cleanTags);
      yandeUrl.searchParams.set('limit', limit.toString());
      yandeUrl.searchParams.set('page', page.toString());

      const yandeRes = await fetch(yandeUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });

      if (yandeRes.ok) {
        const yandePosts = await yandeRes.json();
        if (Array.isArray(yandePosts) && yandePosts.length > 0) {
          sanitizedPosts = yandePosts.map(p => ({
            id: p.id,
            created_at: p.created_at ? new Date(p.created_at * 1000).toISOString() : new Date().toISOString(),
            score: p.score || 0,
            fav_count: 0,
            rating: p.rating || 'g',
            tag_string_artist: '',
            tag_string_character: '',
            tag_string_copyright: '',
            tag_string_general: p.tags || '',
            tag_string: p.tags || '',
            preview_url: p.sample_url || p.preview_url || p.file_url || '',
            source_url: `https://yande.re/post/show/${p.id}`,
            image_width: p.width || 832,
            image_height: p.height || 1216
          }));
        }
      }
    } catch (yErr) {
      console.warn("[Danbooru Proxy] Yande fetch failed:", yErr);
    }
  }

  return json({
    success: true,
    count: sanitizedPosts.length,
    posts: sanitizedPosts
  }, 200, { 'Access-Control-Allow-Origin': '*' });
}
