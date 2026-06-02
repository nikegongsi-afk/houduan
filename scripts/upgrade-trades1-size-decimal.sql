-- 仅升级 trades1.size 为两位小数（后台交易记录用）
-- 在 Supabase Dashboard -> SQL Editor 中整段执行
--
-- 注意：不要修改 trades / vip_trades 表，它们被其他视图依赖且当前无数据。

-- 1) 删除依赖 trades1.size 的视图
DROP VIEW IF EXISTS public.view_trader_trade;

-- 2) 修改 trades1.size 字段类型
ALTER TABLE public.trades1
  ALTER COLUMN size TYPE numeric(18, 2)
  USING size::numeric;

-- 3) 重建首页交易视图
CREATE VIEW public.view_trader_trade AS
SELECT
  t.symbol,
  t.entry_date,
  t.entry_price,
  t.size,
  t.exit_date,
  t.exit_price,
  t.current_price,
  t.image_url,
  t.id,
  t.trader_uuid,
  t.trade_market,
  t.direction,
  t.is_important,
  m.currency,
  m.exchange_rate
FROM public.trades1 t
LEFT JOIN public.trade_market m ON t.trade_market = m.marketname
WHERE t.isdel = false;

-- 4) 验证
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trades1'
  AND column_name = 'size';

SELECT COUNT(*) AS view_row_count FROM public.view_trader_trade;
