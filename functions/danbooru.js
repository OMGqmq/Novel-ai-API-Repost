/**
 * Cloudflare Pages Function: /danbooru
 * Proxies Danbooru API requests to bypass CORS and User-Agent restrictions.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const jsonResponse = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    let tags = '';
    let limit = 20;
    let page = 1;

    if (request.method === 'GET') {
      const url = new URL(request.url);
      tags = url.searchParams.get('tags') || '';
      limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
      page = parseInt(url.searchParams.get('page') || '1', 10);
    } else if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      tags = body.tags || '';
      limit = Math.min(parseInt(body.limit || '20', 10), 50);
      page = parseInt(body.page || '1', 10);
    }

    // Build Danbooru API URL
    const targetUrl = new URL('https://danbooru.donmai.us/posts.json');
    if (tags) {
      targetUrl.searchParams.set('tags', tags.trim());
    }
    targetUrl.searchParams.set('limit', String(limit));
    targetUrl.searchParams.set('page', String(page));

    // Request Danbooru with proper User-Agent
    const danbooruRes = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'NovelAIOpusArt/2.0 (InspirationTool; contact: novelai-art-repost)',
        'Accept': 'application/json',
      },
    });

    if (!danbooruRes.ok) {
      const errText = await danbooruRes.text();
      return jsonResponse(
        { error: `Danbooru API error: ${danbooruRes.status} ${danbooruRes.statusText}`, details: errText },
        danbooruRes.status
      );
    }

    const posts = await danbooruRes.json();
    if (!Array.isArray(posts)) {
      return jsonResponse({ success: false, posts: [], message: 'No posts returned or invalid response' });
    }

    // Format and sanitize output for frontend
    const sanitizedPosts = posts.map(p => {
      // Find suitable thumbnail/preview url
      let previewUrl = p.preview_file_url || p.large_file_url || p.file_url || '';
      if (p.media_asset && p.media_asset.variants) {
        const sampleVar = p.media_asset.variants.find(v => v.type === 'sample' || v.type === '360x360' || v.type === '180x180');
        if (sampleVar && sampleVar.url) previewUrl = sampleVar.url;
      }

      return {
        id: p.id,
        created_at: p.created_at,
        score: p.score,
        fav_count: p.fav_count,
        rating: p.rating,
        tag_string_artist: p.tag_string_artist || '',
        tag_string_character: p.tag_string_character || '',
        tag_string_copyright: p.tag_string_copyright || '',
        tag_string_general: p.tag_string_general || '',
        tag_string: p.tag_string || '',
        preview_url: previewUrl,
        image_width: p.image_width,
        image_height: p.image_height,
      };
    });

    return jsonResponse({
      success: true,
      count: sanitizedPosts.length,
      posts: sanitizedPosts,
    });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Internal error' }, 500);
  }
}
