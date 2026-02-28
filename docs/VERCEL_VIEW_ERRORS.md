# 在 Vercel 查看部署/构建报错

## 1. 打开项目
登录 [vercel.com](https://vercel.com) → 进入你的项目（GameScienceTest）。

## 2. 看某次部署的日志
- 点顶部 **「Deployments」**
- 在列表里找到**失败的那次**（状态为 Failed / 红色）
- 点进该次部署

## 3. 看构建阶段的红色报错
- 在部署详情里找到 **「Building」** 或 **「Build Logs」**
- 点开展开
- 往下滚动，**红色字**就是失败原因（例如 invalid config、syntax error、command failed）

## 4. 看运行时报错（Runtime / Function Logs）
- 同一次部署详情里，找 **「Functions」** 或 **「Logs」** / **「Runtime Logs」**
- 这里能看到请求时的错误（如 Redis、未捕获异常）

## 5. 复制完整报错
把 Building 里红色那几行（或一整段）复制下来，方便排查。
