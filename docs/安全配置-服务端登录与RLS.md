# 安全配置：账号体系、RLS 与服务端代理

> 本文说明后台多用户账号体系、数据库读写代理、AI 调用代理的设计、所需环境变量，以及云端对象如何重建。
> 所有密钥都**不进代码仓库**；仓库内只保留带占位符的模板。

## 一、分层设计

```
浏览器（不持有任何云凭证、不持有密码哈希）
  ├─ 读数据：POST /api/data ─────────────┐
  ├─ 登录：  POST /api/admin/login      │
  ├─ 会话：  /api/admin/{session,logout,accounts,sessions}
  ├─ 写数据：POST /api/admin/db ────────┼→ 服务端校验数据库会话
  └─ AI：    /api/ai/{models,generate,search}    │
                                       ├→ 云 SDK 调用 admin_write / admin_auth / LLM
                                       └→ 匿名访问强制只看已发布内容
```

- 云服务的 `endpoint` / `publishableKey` 只在服务端环境变量；浏览器只访问本站 `/api/*`。
- **账号与会话**：`admin_users` / `admin_sessions` 是 server-only 表——开启 RLS、不建任何策略、不向 `anon` / `authenticated` 授权，只能通过 `SECURITY DEFINER` 函数 `public.admin_auth()` 访问。匿名直读返回 `42501 permission denied`。
- **密码**：`scrypt(N=2^14, r=8, p=1)` + 每账号 16 字节随机盐，格式 `scrypt$N$r$p$salt$hash`；数据库不存明文，前端 bundle 不含任何口令。登录失败 5 次锁定 15 分钟，并叠加按 IP 的进程内限流；账号不存在时也执行一次等价 scrypt 运算，避免响应时间枚举用户名。
- **会话**：cookie 里是 256 位随机 token（`httpOnly` + `sameSite=strict`，7 天），数据库只存 `sha256(token)`。每次请求都查库确认「未过期、未吊销、账号仍启用」，因此停用账号、改密、手动吊销**立即生效**，不再需要轮换签名密钥。
- `/api/data` 是只读白名单代理：匿名请求强制过滤 `status='published'`，且剔除挂在未发布作品上的解读；`generation_jobs` 等后台数据要求登录态。
- `/api/ai/*` 全部要求登录态并带进程内限流；模型成功率统计与全文检索缓存放在服务端（`.data/ai-search-state.json`）。
- 内容表（works / styles / audiences / interpretations / generation_jobs）的 RLS **只有 SELECT**；唯一写入口是校验服务端密钥的 `public.admin_write()`。

## 二、角色与权限

| 角色 | 内容读写 / AI 生成 | 修改自己密码 | 查看自己会话 | 账号管理 / 吊销任意会话 |
|---|---|---|---|---|
| `owner` 超级管理员 | ✓ | ✓ | ✓ | ✓ |
| `admin` 管理员 | ✓ | ✓ | ✓ | ✗ |
| `editor` 编辑 | ✓ | ✓ | ✓ | ✗ |

保护规则：必须保留至少一个启用状态的 `owner`；不能停用自己的账号、不能删除自己；改密 / 停用会吊销该账号的全部会话（含当前）。首个 owner 由 `ADMIN_USERNAME` + `ADMIN_PASSWORD` 在账号表为空时自动创建，云端函数保证「表内已有账号即拒绝」，且调用需要服务端私有密钥，因此**不是公开注册入口**。

## 三、环境变量

复制 `.env.example` 为 `.env.local`（已被 `.gitignore` 排除）：

| 变量 | 用途 | 生成方式 |
|---|---|---|
| `ADMIN_USERNAME` | 首个 owner 的用户名 | 3–40 位小写字母/数字/`.` `_` `-`，默认 `admin` |
| `ADMIN_PASSWORD` | 首个 owner 的**初始**口令 | 至少 10 位；建号后登录以数据库为准 |
| `ADMIN_DB_SECRET` | 服务端调用 `admin_write()` / `admin_auth()` 的密钥 | `openssl rand -hex 32`，需与云端函数内的哈希对应 |
| `CLOUD_ENDPOINT` | 云服务数据面地址 | 云服务开通时返回 |
| `CLOUD_PUBLISHABLE_KEY` | 云服务 publishable key | `wbpk_` 开头，仅服务端使用 |
| `CLOUD_OAUTH_RELAY_BASE_URL` | OAuth relay 地址 | 可选 |
| `CLOUD_RESOURCE_ID` | 资源 ID | 可选 |
| `SITE_URL` | 站点规范地址 | 影响 canonical / sitemap / JSON-LD |

云端函数里存的是 `ADMIN_DB_SECRET` 的 **MD5 哈希**，不是明文：
`printf '%s' "$ADMIN_DB_SECRET" | md5 -q`

> 旧版自包含签名 cookie 使用的 `SESSION_SECRET` 已不再需要。轮换 `ADMIN_DB_SECRET` 时，必须同时重建 `admin_write()` 与 `admin_auth()` 里的哈希。

## 四、云端对象（一次性配置）

以下 SQL 通过云服务的数据库管理通道以 `migrate` 模式执行，**每条语句单独一次调用**。把 `__MD5_OF_ADMIN_DB_SECRET__` 替换为上一节得到的哈希。

**1. 建表（每条一句）**

```sql
CREATE TABLE public.admin_users (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.-]{3,40}$'), password_hash TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','admin','editor')), is_active BOOLEAN NOT NULL DEFAULT true, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ, last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())
```

```sql
CREATE TABLE public.admin_sessions (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id BIGINT NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ, ip TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '')
```

```sql
CREATE INDEX admin_sessions_user_idx ON public.admin_sessions (user_id, revoked_at)
```

**2. 隔离（每条一句）**

```sql
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY
```

```sql
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY
```

```sql
REVOKE ALL ON TABLE public.admin_users, public.admin_sessions FROM PUBLIC, anon, authenticated
```

**3. 账号特权函数**（`bootstrap` / `get_user` / `login_result` / `create_session` / `verify_session` / `revoke_session` / `revoke_user_sessions` / `list_sessions` / `list_users` / `create_user` / `update_user` / `set_password` / `delete_user`）

```sql
CREATE OR REPLACE FUNCTION public.admin_auth(
  p_secret text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp AS $fn$
DECLARE
  v_user public.admin_users%ROWTYPE;
  v_row jsonb;
  v_rows jsonb;
  v_id bigint;
  v_actor bigint;
  v_actor_role text;
  v_uname text;
  v_hash text;
  v_role text;
  v_active boolean;
  v_display text;
  v_token text;
  v_success boolean;
  v_cnt integer;
BEGIN
  IF md5(coalesce(p_secret,'')) <> '__MD5_OF_ADMIN_DB_SECRET__' THEN
    RETURN jsonb_build_object('ok',false,'error','unauthorized');
  END IF;
  v_uname := lower(btrim(coalesce(p_payload->>'username','')));
  v_hash := coalesce(p_payload->>'password_hash','');
  v_token := coalesce(p_payload->>'token_hash','');
  v_id := NULLIF(p_payload->>'user_id','')::bigint;
  v_actor := NULLIF(p_payload->>'actor_user_id','')::bigint;
  v_actor_role := coalesce(p_payload->>'actor_role','');
  v_success := (p_payload->>'success') = 'true';

  IF p_action = 'bootstrap' THEN
    IF EXISTS (SELECT 1 FROM public.admin_users) THEN
      RETURN jsonb_build_object('ok',false,'error','already_initialized');
    END IF;
    IF v_uname !~ '^[a-z0-9_.-]{3,40}$' OR v_hash = '' THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_input');
    END IF;
    INSERT INTO public.admin_users AS t (username,password_hash,display_name,role)
    VALUES (v_uname,v_hash,coalesce(p_payload->>'display_name','管理员'),'owner')
    RETURNING to_jsonb(t) - 'password_hash' INTO v_row;
    RETURN jsonb_build_object('ok',true,'user',v_row);
  END IF;

  IF p_action = 'get_user' THEN
    SELECT * INTO v_user FROM public.admin_users WHERE username = v_uname;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','user_not_found'); END IF;
    RETURN jsonb_build_object('ok',true,'user',to_jsonb(v_user));
  END IF;

  IF p_action = 'login_result' THEN
    UPDATE public.admin_users SET
      failed_attempts = CASE WHEN v_success THEN 0 ELSE failed_attempts + 1 END,
      locked_until = CASE WHEN v_success THEN NULL
                          WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes'
                          ELSE locked_until END,
      last_login_at = CASE WHEN v_success THEN now() ELSE last_login_at END,
      updated_at = now()
    WHERE id = v_id;
    RETURN jsonb_build_object('ok',true);
  END IF;

  IF p_action = 'create_session' THEN
    DELETE FROM public.admin_sessions WHERE expires_at < now() - interval '1 day';
    INSERT INTO public.admin_sessions AS t (token_hash,user_id,expires_at,ip,user_agent)
    VALUES (v_token,v_id,(p_payload->>'expires_at')::timestamptz,
            coalesce(p_payload->>'ip',''),coalesce(p_payload->>'user_agent',''))
    RETURNING to_jsonb(t) - 'token_hash' INTO v_row;
    RETURN jsonb_build_object('ok',true,'session',v_row);
  END IF;

  IF p_action = 'verify_session' THEN
    SELECT jsonb_build_object('ok',true,'session_id',s.id,'user_id',u.id,
             'username',u.username,'display_name',u.display_name,'role',u.role)
      INTO v_row
      FROM public.admin_sessions s JOIN public.admin_users u ON u.id = s.user_id
     WHERE s.token_hash = v_token AND s.revoked_at IS NULL
       AND s.expires_at > now() AND u.is_active = true;
    IF v_row IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_session');
    END IF;
    UPDATE public.admin_sessions SET last_seen_at = now() WHERE token_hash = v_token;
    RETURN v_row;
  END IF;

  IF p_action = 'revoke_session' THEN
    IF v_token <> '' THEN
      UPDATE public.admin_sessions SET revoked_at = now()
       WHERE token_hash = v_token AND revoked_at IS NULL;
    ELSIF NULLIF(p_payload->>'session_id','') IS NOT NULL THEN
      UPDATE public.admin_sessions SET revoked_at = now()
       WHERE id = (p_payload->>'session_id')::bigint AND revoked_at IS NULL
         AND (v_actor_role = 'owner' OR user_id = v_actor);
    END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;

  IF p_action = 'revoke_user_sessions' THEN
    UPDATE public.admin_sessions SET revoked_at = now()
     WHERE user_id = v_id AND revoked_at IS NULL;
    RETURN jsonb_build_object('ok',true);
  END IF;

  IF p_action = 'list_sessions' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id',s.id,'user_id',s.user_id,'username',u.username,
             'created_at',s.created_at,'expires_at',s.expires_at,
             'last_seen_at',s.last_seen_at,'revoked_at',s.revoked_at,
             'ip',s.ip,'user_agent',s.user_agent,'current',s.token_hash = v_token
           ) ORDER BY s.created_at DESC), '[]'::jsonb)
      INTO v_rows
      FROM public.admin_sessions s JOIN public.admin_users u ON u.id = s.user_id
     WHERE v_actor_role = 'owner' OR s.user_id = v_actor;
    RETURN jsonb_build_object('ok',true,'sessions',v_rows);
  END IF;

  IF p_action = 'list_users' THEN
    IF v_actor_role <> 'owner' THEN
      RETURN jsonb_build_object('ok',false,'error','forbidden');
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(u) - 'password_hash' ORDER BY u.id), '[]'::jsonb)
      INTO v_rows FROM public.admin_users u;
    RETURN jsonb_build_object('ok',true,'users',v_rows);
  END IF;

  IF p_action = 'create_user' THEN
    IF v_actor_role <> 'owner' THEN
      RETURN jsonb_build_object('ok',false,'error','forbidden');
    END IF;
    IF v_uname !~ '^[a-z0-9_.-]{3,40}$' OR v_hash = '' THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_input');
    END IF;
    IF EXISTS (SELECT 1 FROM public.admin_users WHERE username = v_uname) THEN
      RETURN jsonb_build_object('ok',false,'error','username_taken');
    END IF;
    v_role := coalesce(p_payload->>'role','editor');
    IF v_role NOT IN ('owner','admin','editor') THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_role');
    END IF;
    INSERT INTO public.admin_users AS t (username,password_hash,display_name,role)
    VALUES (v_uname,v_hash,coalesce(p_payload->>'display_name',v_uname),v_role)
    RETURNING to_jsonb(t) - 'password_hash' INTO v_row;
    RETURN jsonb_build_object('ok',true,'user',v_row);
  END IF;

  IF p_action IN ('update_user','set_password','delete_user') THEN
    SELECT * INTO v_user FROM public.admin_users WHERE id = v_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','user_not_found'); END IF;
  END IF;

  IF p_action = 'update_user' THEN
    IF v_actor_role <> 'owner' THEN
      RETURN jsonb_build_object('ok',false,'error','forbidden');
    END IF;
    IF v_id = v_actor AND (p_payload->>'is_active') = 'false' THEN
      RETURN jsonb_build_object('ok',false,'error','cannot_disable_self');
    END IF;
    v_role := coalesce(NULLIF(p_payload->>'role',''),v_user.role);
    v_active := CASE WHEN p_payload ? 'is_active'
                     THEN (p_payload->>'is_active') = 'true' ELSE v_user.is_active END;
    v_display := coalesce(NULLIF(p_payload->>'display_name',''),v_user.display_name);
    IF v_role NOT IN ('owner','admin','editor') THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_role');
    END IF;
    IF v_user.role = 'owner' AND (v_role <> 'owner' OR NOT v_active) THEN
      SELECT count(*) INTO v_cnt FROM public.admin_users
       WHERE role = 'owner' AND is_active = true;
      IF v_cnt <= 1 THEN RETURN jsonb_build_object('ok',false,'error','last_owner'); END IF;
    END IF;
    UPDATE public.admin_users SET role = v_role, is_active = v_active,
      display_name = v_display, updated_at = now() WHERE id = v_id;
    IF NOT v_active THEN
      UPDATE public.admin_sessions SET revoked_at = now()
       WHERE user_id = v_id AND revoked_at IS NULL;
    END IF;
    RETURN jsonb_build_object('ok',true);
  END IF;

  IF p_action = 'set_password' THEN
    IF v_hash = '' THEN RETURN jsonb_build_object('ok',false,'error','invalid_input'); END IF;
    IF v_actor_role <> 'owner' AND v_actor IS DISTINCT FROM v_id THEN
      RETURN jsonb_build_object('ok',false,'error','forbidden');
    END IF;
    UPDATE public.admin_users SET password_hash = v_hash,
      failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = v_id;
    UPDATE public.admin_sessions SET revoked_at = now()
     WHERE user_id = v_id AND revoked_at IS NULL;
    RETURN jsonb_build_object('ok',true);
  END IF;

  IF p_action = 'delete_user' THEN
    IF v_actor_role <> 'owner' THEN
      RETURN jsonb_build_object('ok',false,'error','forbidden');
    END IF;
    IF v_id = v_actor THEN
      RETURN jsonb_build_object('ok',false,'error','cannot_delete_self');
    END IF;
    IF v_user.role = 'owner' THEN
      SELECT count(*) INTO v_cnt FROM public.admin_users
       WHERE role = 'owner' AND is_active = true;
      IF v_cnt <= 1 THEN RETURN jsonb_build_object('ok',false,'error','last_owner'); END IF;
    END IF;
    DELETE FROM public.admin_users WHERE id = v_id;
    RETURN jsonb_build_object('ok',true);
  END IF;

  RETURN jsonb_build_object('ok',false,'error','unknown_action');
END
$fn$;
```

**4. 内容表 RLS 与 `admin_write()`**：保持上一版配置不变（5 张表只有 `SELECT` 策略 + 特权写函数），此处不再重复。

## 五、部署与自检清单

1. 配置上表环境变量；首个 owner 会在第一次登录时自动创建。
2. 登录后立刻在「账号与会话」修改初始密码，并为每位协作者单独建号。
3. 自检：
   - 匿名直接查 `admin_users` → `42501`；
   - 未登录调用 `/api/ai/*`、`/api/admin/db`、`/api/admin/accounts` → `401`；
   - `editor` 调用账号管理 → `403`；
   - 吊销某条会话后，用该 cookie 再请求 → `401`；
   - 连续 5 次错误密码 → `423` 锁定。
4. 需要全员下线时：owner 在后台点「吊销全部会话」，或轮换 `ADMIN_DB_SECRET`（会同时影响内容写入函数，需同步更新云端哈希）。

## 六、已知边界

- 这是**后台多用户账号体系**，前台读者仍无需注册登录（内容站无用户内容）。
- 没有邮件/手机找回密码、邮箱验证与 MFA；密码重置由 `owner` 在后台完成。
- 登录限流是进程内滑动窗口，多实例部署时每个实例各自计数；账号级锁定在数据库，跨实例生效。
- 会话校验每次请求查一次数据库；匿名请求（无 cookie）零数据库开销。
- 云端 `admin_auth()` 与 `admin_write()` 共用同一个服务端密钥，靠密钥 + action/表/列白名单防护。
