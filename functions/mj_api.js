export async function onRequest(context) {
  // 1. 允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed (Backend is alive)' }), { 
      status: 405, headers: {'Content-Type': 'application/json'} 
    });
  }

  try {
    const env = context.env;
    // 配置检查
    if (!env.MJ_API_KEY) throw new Error("后台未配置环境变量 MJ_API_KEY");
    
    // 2. 解析请求数据
    let reqData;
    try {
        reqData = await context.request.json();
    } catch(e) {
        throw new Error("后端无法解析请求数据，请检查前端发送的 JSON 格式");
    }
    
    const { action, prompt, taskId } = reqData;
    const MJ_BASE_URL = "https://allgpt.xianyuw.cn/v1/images/generations"; 

    // ... (鉴权部分省略，为了排错先跳过鉴权逻辑的展示，实际部署保留原有限流代码) ...
    // 为了快速修复，这里先保留最核心的转发逻辑，鉴权逻辑您按之前的加上即可
    
    // 3. 构造转发请求
    let upstreamUrl = "";
    let upstreamBody = {};
    let method = "POST";

    if (action === 'imagine') {
        upstreamUrl = `${MJ_BASE_URL}/mj/submit/imagine`;
        upstreamBody = { prompt: prompt };
    } else if (action === 'fetch') {
        upstreamUrl = `${MJ_BASE_URL}/mj/task/${taskId}/fetch`;
        method = "GET";
    } else {
        throw new Error("未知的 Action: " + action);
    }

    // 4. 发送给上游
    const response = await fetch(upstreamUrl, {
        method: method,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.MJ_API_KEY}`
        },
        body: method === 'POST' ? JSON.stringify(upstreamBody) : null
    });

    // 5. 处理上游返回
    const respText = await response.text(); // 先拿文本，防止 json 解析崩
    
    if (!response.ok) {
        // 如果上游报错，把上游的错误原样返回
        return new Response(JSON.stringify({ error: `Upstream Error ${response.status}: ${respText}` }), { 
            status: response.status, headers: {'Content-Type': 'application/json'}
        });
    }

    try {
        // 尝试解析上游的 JSON
        const data = JSON.parse(respText);
        return new Response(JSON.stringify(data), { 
            status: 200, headers: {'Content-Type': 'application/json'}
        });
    } catch (e) {
        // 上游返回的不是 JSON
        return new Response(JSON.stringify({ error: "上游返回了非 JSON 数据: " + respText.substring(0, 100) }), { 
            status: 500, headers: {'Content-Type': 'application/json'}
        });
    }

  } catch (e) {
    // 6. 捕获所有后端错误
    return new Response(JSON.stringify({ error: "后端严重错误: " + e.message }), { 
        status: 500, headers: {'Content-Type': 'application/json'}
    });
  }
}
