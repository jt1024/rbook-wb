# 安全配置：服务端登录与 RLS

> 本文说明后台登录与数据库写权限的设计、所需环境变量，以及云端对象如何重建。
> 所有密钥都**不进代码仓库**；仓库内只保留带占位符的模板。

## 一、分层设计

```
浏览器
  ├─ 读数据：直接走云 SDK（RLS 允许匿名 SELECT，无写权限）
  ├─ 登录：POST /api/admin/login → 服务端比对 ADMIN_PASSWORD → httpOnly 会话 cookie
  └─ 写数据：POST /api/admin/db → 校验签名 cookie → 云端 admin_write() 函数
                                   （SECURITY DEFINER，校验服务端密钥后执行）
```

- 口令只存在于服务端 `ADMIN_PASSWORD`，前端 bundle 里没有任何口令。
- 会话 cookie：`HMAC-SHA256` 签名，含过期时间，`httpOnly` + `sameSite=strict`，默认 7 天。
- 数据库 5 张表（works / styles / audiences / interpretations / generation_jobs）的 RLS 策略**只有 SELECT**，匿名与登录用户都无法直接 INSERT/UPDATE/DELETE。
- 唯一的写入口是 `SECURITY DEFINER` 函数 `public.admin_write()`，它校验服务端密钥后才执行，且对表名、操作类型、列名做白名单校验。

注意：会话是自包含签名 cookie，无服务端吊销列表。退出登录会删除浏览器 cookie；已复制出去的 cookie 在过期前仍然有效，因此请保持 `SESSION_SECRET` 私密，必要时轮换密钥即可让所有旧会话立即失效。

## 二、环境变量

复制 `.env.example` 为 `.env.local`（已被 `.gitignore` 排除）：

| 变量 | 用途 | 生成方式 |
|---|---|---|
| `ADMIN_PASSWORD` | 后台登录口令 | 自定义强口令，不写进任何代码文件 |
| `SESSION_SECRET` | 会话 cookie 签名密钥 | `openssl rand -hex 32` |
| `ADMIN_DB_SECRET` | 服务端调用 `admin_write()` 的密钥 | `openssl rand -hex 32`，需与云端函数内的哈希对应 |

云端函数里存的是 `ADMIN_DB_SECRET` 的 **MD5 哈希**，不是明文：
`printf '%s' "$ADMIN_DB_SECRET" | md5 -q`

## 三、云端对象（一次性配置）

以下 SQL 通过云服务的数据库管理通道以 `migrate` 模式执行。把 `__MD5_OF_ADMIN_DB_SECRET__` 替换为上一步得到的哈希。

**1. 收紧 RLS（幂等）**

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['works','styles','audiences','interpretations','generation_jobs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_read', t);
  END LOOP;
END $$;
```

**2. 创建特权写函数**

```sql
CREATE OR REPLACE FUNCTION public.admin_write(
  p_secret text, p_table text, p_op text, p_data jsonb, p_match jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_sql text; v_result jsonb;
  v_cols text[] := ARRAY[]::text[]; v_vals text[] := ARRAY[]::text[];
  v_sets text[] := ARRAY[]::text[]; v_conds text[] := ARRAY[]::text[];
  v_key text; v_val text;
BEGIN
  IF md5(COALESCE(p_secret,'')) <> '__MD5_OF_ADMIN_DB_SECRET__' THEN
    RAISE EXCEPTION 'admin_write: unauthorized';
  END IF;
  IF p_table NOT IN ('works','styles','audiences','interpretations','generation_jobs') THEN
    RAISE EXCEPTION 'admin_write: invalid table';
  END IF;
  IF p_op NOT IN ('insert','update','delete') THEN
    RAISE EXCEPTION 'admin_write: invalid op';
  END IF;
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(p_data) LOOP
    IF v_key !~ '^[a-z_][a-z0-9_]*$' THEN RAISE EXCEPTION 'admin_write: invalid column'; END IF;
    v_cols := array_append(v_cols, quote_ident(v_key));
    v_vals := array_append(v_vals, quote_nullable(v_val));
    v_sets := array_append(v_sets, quote_ident(v_key) || ' = ' || quote_nullable(v_val));
  END LOOP;
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(p_match) LOOP
    IF v_key !~ '^[a-z_][a-z0-9_]*$' THEN RAISE EXCEPTION 'admin_write: invalid column'; END IF;
    v_conds := array_append(v_conds, quote_ident(v_key) || ' = ' || quote_nullable(v_val));
  END LOOP;
  IF p_op = 'insert' THEN
    IF array_length(v_cols,1) IS NULL THEN RAISE EXCEPTION 'admin_write: empty data'; END IF;
    v_sql := 'INSERT INTO public.' || quote_ident(p_table) || ' (' || array_to_string(v_cols,', ')
             || ') VALUES (' || array_to_string(v_vals,', ') || ') RETURNING to_jsonb('
             || quote_ident(p_table) || ') AS r';
  ELSIF p_op = 'update' THEN
    IF array_length(v_sets,1) IS NULL OR array_length(v_conds,1) IS NULL THEN
      RAISE EXCEPTION 'admin_write: data and match required';
    END IF;
    v_sql := 'UPDATE public.' || quote_ident(p_table) || ' SET ' || array_to_string(v_sets,', ')
             || ' WHERE ' || array_to_string(v_conds,' AND ') || ' RETURNING to_jsonb('
             || quote_ident(p_table) || ') AS r';
  ELSE
    IF array_length(v_conds,1) IS NULL THEN RAISE EXCEPTION 'admin_write: match required'; END IF;
    v_sql := 'DELETE FROM public.' || quote_ident(p_table) || ' WHERE ' || array_to_string(v_conds,' AND ')
             || ' RETURNING to_jsonb(' || quote_ident(p_table) || ') AS r';
  END IF;
  EXECUTE 'WITH q AS (' || v_sql || ') SELECT COALESCE(jsonb_agg(r), ''[]''::jsonb) FROM q' INTO v_result;
  RETURN v_result;
END
$fn$;
```

## 四、部署清单

1. 在部署环境配置上表三个环境变量（不要提交 `.env.local`）。
2. 更换 `ADMIN_DB_SECRET` 时，必须同步重建函数里的 MD5 哈希，否则后台写入会报 `unauthorized`。
3. 轮换 `SESSION_SECRET` 会让所有已签发的会话立即失效。
4. 部署后自检：匿名直接调用数据库写接口应返回空结果/被拒；未登录调用 `/api/admin/db` 应返回 401；登录后写一条数据应成功。

## 五、已知边界

- 这是**单管理员口令**方案，不是多用户账号体系（二期接入正式 Auth）。
- LLM 网关仍可由匿名前端直接调用（用于 AI 检索与解读生成），如需防止额度滥用，应把 LLM 调用也收拢到服务端代理。
