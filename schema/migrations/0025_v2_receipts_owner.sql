-- 0025_v2_receipts_owner.sql
-- v2_receipts.owner: 属主（JWT subject）审计/授权列。
--
-- Authority: 审查 LP-5（findings ZZ-cross-dimensional · API1/API5/API6 同根）。
--
-- 设计要点:
--   1. 可空 owner:旧行/匿名（offline 模式）创建的行 owner 恒为 NULL——公开可读
--      （单机信任模式·24§3.1 双轨鉴权下的匿名路径保持现有行为不破坏）。
--   2. 受保护模式（jwtSecret 配置）下创建的 receipt 写入 principal.userId——
--      GET 列表/详情按「owner = principal.userId OR owner IS NULL（公开）」过滤，
--      实现对象级授权（BOLA 修复·API1）。
--   3. 响应契约不变（receiptRowToDto 不含 owner）——前端/CLI 零破坏。
--   4. 权限模型:viewer 只读（POST 403·FORBIDDEN）、researcher/admin 可写
--      （requireRole 接线·API5）。
--   5. 不回填旧行（NULL 即「公开」语义·append-only 审计列）。

ALTER TABLE v2_receipts ADD COLUMN owner TEXT;
