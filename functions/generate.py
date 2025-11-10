# functions/generate.py (临时调试代码)

import json

async def onRequest(context):
    # 这是我们要做的第一件事。如果这条日志都看不到，说明有根本性问题。
    print("--- Python 函数已启动！ ---")

    try:
        # 我们创建一个简单的、保证有效的 JSON 响应。
        response_data = {
            "message": "来自 Python 函数的问候！它正在工作！",
            "note": "如果你看到了这个，说明基础设置是正确的。"
        }
        
        print("--- 正在发送成功响应。 ---")

        # 我们返回这个响应。
        return Response(
            json.dumps(response_data),
            status=200,
            headers={'Content-Type': 'application/json'}
        )
    except Exception as e:
        # 如果连这么简单的代码都失败了，我们会尝试记录下错误。
        print(f"--- 简单函数出错：{str(e)} ---")
        return Response(f"错误: {str(e)}", status=500)
