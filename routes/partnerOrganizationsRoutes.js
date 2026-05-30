const express = require('express');
const router = express.Router();
const { select, insert, update, delete: deleteData, count } = require('../config/supabase');
const { getUserFromSession, checkUserRole, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');

const DEFAULT_PARTNER_SECTION_TITLE = 'Partner Institutions';
const LEGACY_PARTNER_SECTION_TITLES = new Set(['合作机构', '合作伙伴']);

function normalizePartnerSectionTitle(title) {
    const trimmed = String(title || '').trim();
    if (!trimmed || LEGACY_PARTNER_SECTION_TITLES.has(trimmed)) {
        return DEFAULT_PARTNER_SECTION_TITLE;
    }
    return trimmed;
}

function pickPartnerSectionTitle(...organizationLists) {
    for (const organizations of organizationLists) {
        if (!organizations?.length) continue;
        for (const org of organizations) {
            const trimmed = org.section_title?.trim();
            if (trimmed && !LEGACY_PARTNER_SECTION_TITLES.has(trimmed)) {
                return trimmed;
            }
        }
    }
    return DEFAULT_PARTNER_SECTION_TITLE;
}

// 获取合作单位列表（公开接口，不需要认证，根据Web-Trader-UUID过滤）
router.get('/', async (req, res) => {
    try {
        const Web_Trader_UUID = req.headers['web-trader-uuid'];
        const conditions = [
            { type: 'eq', column: 'is_active', value: true },
            { type: 'eq', column: 'is_vip', value: false } // 只返回非VIP的合作单位
        ];
        
        // 根据 trader_uuid 过滤
        if (Web_Trader_UUID) {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
        }
        
        const orderBy = { column: 'display_order', ascending: true };
        
        // 查询数据
        const organizations = await select('partner_organizations', '*', conditions, null, null, orderBy);
        
        // 获取标题（从该trader_uuid的所有组织中获取，包括不活跃的）
        let allOrganizations = [];
        if (Web_Trader_UUID) {
            allOrganizations = await select('partner_organizations', '*', [
                { type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID }
            ], null, null, { column: 'id', ascending: false });
        }
        const sectionTitle = pickPartnerSectionTitle(allOrganizations, organizations);
        
        res.status(200).json({ 
            success: true, 
            data: organizations,
            section_title: sectionTitle
        });
    } catch (error) {
        handleError(res, error, '获取合作单位列表失败');
    }
});

// 获取VIP合作单位列表（用于VIP页面）
router.get('/vip', async (req, res) => {
    try {
        const Web_Trader_UUID = req.headers['web-trader-uuid'];
        const conditions = [
            { type: 'eq', column: 'is_active', value: true },
            { type: 'eq', column: 'is_vip', value: true } // 只返回VIP的合作单位
        ];
        
        // 根据 trader_uuid 过滤
        if (Web_Trader_UUID) {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
        }
        
        const orderBy = { column: 'display_order', ascending: true };
        
        // 查询数据
        const organizations = await select('partner_organizations', '*', conditions, null, null, orderBy);
        
        // 获取标题（从该trader_uuid的所有组织中获取，包括不活跃的）
        let allOrganizations = [];
        if (Web_Trader_UUID) {
            allOrganizations = await select('partner_organizations', '*', [
                { type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID }
            ], null, null, { column: 'id', ascending: false });
        }
        const sectionTitle = pickPartnerSectionTitle(allOrganizations, organizations);
        
        res.status(200).json({ 
            success: true, 
            data: organizations,
            section_title: sectionTitle
        });
    } catch (error) {
        handleError(res, error, '获取VIP合作单位列表失败');
    }
});

// 获取合作单位列表（管理接口，需要管理员权限）
router.get('/admin', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0, query = '', is_active, is_vip } = req.query;
        
        // 获取登录用户信息
        const user = await getUserFromSession(req);
        const Web_Trader_UUID = req.headers['web-trader-uuid'];
        
        const conditions = [];
        
        // 根据 trader_uuid 过滤（如果不是超级管理员）
        if (user.role !== 'superadmin') {
            if (user.trader_uuid) {
                conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
            } else if (Web_Trader_UUID) {
                conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
            }
        } else if (Web_Trader_UUID) {
            // 超级管理员也可以根据请求头中的UUID过滤
            conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
        }
        
        if (query && query !== "") {
            conditions.push({ type: 'ilike', column: 'name', value: `%${query}%` });
        }
        if (is_active !== undefined && is_active !== "") {
            conditions.push({ type: 'eq', column: 'is_active', value: is_active === 'true' });
        }
        if (is_vip !== undefined && is_vip !== "") {
            conditions.push({ type: 'eq', column: 'is_vip', value: is_vip === 'true' });
        }
        
        const orderBy = { column: 'display_order', ascending: true };
        
        // 查询数据
        const organizations = await select('partner_organizations', '*', conditions, 
            parseInt(limit), 
            parseInt(offset), 
            orderBy
        );
        
        // 查询总记录数
        const total = await count('partner_organizations', conditions);
        
        // 获取标题（从该trader_uuid的所有组织中获取，包括不活跃的）
        let allOrgs = [];
        const titleConditionsForQuery = [];
        if (user.role !== 'superadmin') {
            if (user.trader_uuid) {
                titleConditionsForQuery.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
            } else if (Web_Trader_UUID) {
                titleConditionsForQuery.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
            }
        } else if (Web_Trader_UUID) {
            titleConditionsForQuery.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
        }
        
        if (titleConditionsForQuery.length > 0) {
            allOrgs = await select('partner_organizations', '*', titleConditionsForQuery, null, null, { column: 'id', ascending: false });
        }
        const sectionTitle = pickPartnerSectionTitle(allOrgs, organizations);
        
        // 格式化数据
        const formattedOrganizations = organizations.map(org => ({
            ...org,
            created_at: formatDatetime(org.created_at),
            updated_at: org.updated_at ? formatDatetime(org.updated_at) : null
        }));
        
        res.status(200).json({ 
            success: true, 
            data: formattedOrganizations, 
            total: total,
            section_title: sectionTitle
        });
    } catch (error) {
        handleError(res, error, '获取合作单位列表失败');
    }
});

// 更新标题 - 需要管理员权限（根据trader_uuid更新）
router.put('/section-title', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { section_title } = req.body;
        
        if (!section_title || section_title.trim() === '') {
            return res.status(400).json({ success: false, message: '标题不能为空' });
        }
        
        // 获取登录用户信息和trader_uuid
        const user = await getUserFromSession(req);
        const Web_Trader_UUID = req.headers['web-trader-uuid'];
        
        // 确定要更新的trader_uuid
        let targetTraderUUID = null;
        if (user.role !== 'superadmin') {
            targetTraderUUID = user.trader_uuid || Web_Trader_UUID;
        } else if (Web_Trader_UUID) {
            targetTraderUUID = Web_Trader_UUID;
        }
        
        if (!targetTraderUUID) {
            return res.status(400).json({ success: false, message: '无法确定trader_uuid，请确保请求头中包含Web-Trader-UUID' });
        }
        
        // 更新该trader_uuid下所有组织的标题（保持一致性）
        const updateData = { section_title: section_title.trim() };
        const updateConditions = [{ type: 'eq', column: 'trader_uuid', value: targetTraderUUID }];
        
        // 先检查是否有记录
        const existingOrgs = await select('partner_organizations', '*', [
            { type: 'eq', column: 'trader_uuid', value: targetTraderUUID }
        ], 1, 0);
        
        if (!existingOrgs || existingOrgs.length === 0) {
            // 如果没有记录，创建一个虚拟记录来存储标题
            const newOrg = {
                name: '标题配置',
                logo_url: null,
                website_url: null,
                display_order: 9999,
                is_active: false, // 设置为不活跃，不会在前端显示
                section_title: section_title.trim(),
                trader_uuid: targetTraderUUID,
                is_vip: false
            };
            const inserted = await insert('partner_organizations', newOrg);
            console.log('创建标题配置记录:', inserted);
        } else {
            // 更新该trader_uuid下所有组织的标题（保持一致性）
            const updated = await update('partner_organizations', updateData, updateConditions);
            console.log('更新标题，影响记录数:', updated ? updated.length : 0);
            console.log('更新后的标题:', section_title.trim());
        }
        
        res.status(200).json({ success: true, message: '标题更新成功', section_title: section_title.trim() });
    } catch (error) {
        console.error('更新标题错误:', error);
        handleError(res, error, '更新标题失败');
    }
});

// 获取单个合作单位
router.get('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const organizations = await select('partner_organizations', '*', [
            { type: 'eq', column: 'id', value: parseInt(id) }
        ]);
        
        if (!organizations || organizations.length === 0) {
            return res.status(404).json({ success: false, message: '合作单位不存在' });
        }
        
        const organization = organizations[0];
        
        res.status(200).json({ success: true, data: organization });
    } catch (error) {
        handleError(res, error, '获取合作单位失败');
    }
});

// 创建合作单位 - 需要管理员权限
router.post('/', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { name, logo_url, website_url, display_order = 0, is_active = true, section_title, is_vip = false } = req.body;
        
        // 验证输入
        if (!name) {
            return res.status(400).json({ success: false, message: '单位名称不能为空' });
        }
        
        // 获取登录用户信息和trader_uuid
        const user = await getUserFromSession(req);
        const Web_Trader_UUID = req.headers['web-trader-uuid'];
        
        // 确定trader_uuid
        const traderUUID = user.trader_uuid || Web_Trader_UUID || null;
        
        // 创建合作单位
        const newOrganization = {
            name,
            logo_url: logo_url || null,
            website_url: website_url || null,
            display_order: parseInt(display_order) || 0,
            is_active: !!is_active,
            section_title: normalizePartnerSectionTitle(section_title),
            trader_uuid: traderUUID,
            is_vip: !!is_vip
        };
        
        const insertedOrganizations = await insert('partner_organizations', newOrganization);
        
        res.status(201).json({ success: true, message: '合作单位创建成功', data: insertedOrganizations[0] });
    } catch (error) {
        handleError(res, error, '创建合作单位失败');
    }
});

// 更新合作单位 - 需要管理员权限
router.put('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, logo_url, website_url, display_order, is_active } = req.body;
        
        // 检查合作单位是否存在
        const existingOrganizations = await select('partner_organizations', '*', [
            { type: 'eq', column: 'id', value: parseInt(id) }
        ]);
        
        if (!existingOrganizations || existingOrganizations.length === 0) {
            return res.status(404).json({ success: false, message: '合作单位不存在' });
        }
        
        // 准备更新数据
        const updateData = {};
        
        if (name !== undefined) updateData.name = name;
        if (logo_url !== undefined) updateData.logo_url = logo_url;
        if (website_url !== undefined) updateData.website_url = website_url;
        if (display_order !== undefined) updateData.display_order = parseInt(display_order) || 0;
        if (is_active !== undefined) updateData.is_active = !!is_active;
        if (section_title !== undefined) updateData.section_title = section_title;
        if (is_vip !== undefined) updateData.is_vip = !!is_vip;
        
        // 更新合作单位
        const updatedOrganizations = await update('partner_organizations', updateData, [
            { type: 'eq', column: 'id', value: parseInt(id) }
        ]);
        
        res.status(200).json({ success: true, message: '合作单位更新成功', data: updatedOrganizations[0] });
    } catch (error) {
        handleError(res, error, '更新合作单位失败');
    }
});

// 删除合作单位 - 需要管理员权限
router.delete('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 检查合作单位是否存在
        const existingOrganizations = await select('partner_organizations', '*', [
            { type: 'eq', column: 'id', value: parseInt(id) }
        ]);
        
        if (!existingOrganizations || existingOrganizations.length === 0) {
            return res.status(404).json({ success: false, message: '合作单位不存在' });
        }
        
        // 删除合作单位
        await deleteData('partner_organizations', [
            { type: 'eq', column: 'id', value: parseInt(id) }
        ]);
        
        res.status(200).json({ success: true, message: '合作单位删除成功' });
    } catch (error) {
        handleError(res, error, '删除合作单位失败');
    }
});

module.exports = router;

