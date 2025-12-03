如何在cloudflare配置你的novel ai key？

登录novel ai官网，进入账户设置，生成你的key［Get Persistent API Token ］

请确保你订阅了opus级，负责会消耗你的点数（anlas）

登录 Cloudflare Dashboard，进入 Workers & Pages

进入你部署的项目，点击设置，找到添加环境变量

变量名为'NOVELAI_API_KEY'，值为你的key如'pst-*****…'

保存

如何在cloudflare配置你的管理员密码?

登录 Cloudflare Dashboard，进入 Workers & Pages。

在左侧菜单找到 KV，点击 Create a Namespace。

名称输入：NAI_LIMIT

点击 Add。

回到您的 Pages 项目 -> Settings (设置) -> Functions (函数)。

找到 KV Namespace Bindings (KV 命名空间绑定)：

点击 Add binding。

Variable name (变量名) 输入：NAI_LIMIT (必须完全一致)。

KV Namespace 选择刚才创建的 NAI_LIMIT。

保存。

找到 Environment Variables (环境变量)：

添加一个新变量。

Variable name: ADMIN_TOKEN

Value: 设置一个您的专属密码（例如 mypassword123）。

保存。
