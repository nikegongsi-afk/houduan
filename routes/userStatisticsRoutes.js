const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { select, count } = require('../config/supabase');
const { getUserFromSession, checkUserRole, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');


// 获取用户统计概览数据
router.get('/overview', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        // 获取登录用户信息
        const user = await getUserFromSession(req);
        const conditions = [];
        
        if (user.role !== 'superadmin') {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
    }
        
        // 总用户数
        const totalUsers = await count('users', conditions);
        
        // 活跃用户数（过去3天内有登录记录的用户）
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 3);
        const activeConditions = [...conditions, { type: 'gt', column: 'last_login', value: thirtyDaysAgo.toISOString() }];
        const activeUsers = await count('users', activeConditions);
        
        // 本周新增用户
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const weeklyConditions = [...conditions, { type: 'gt', column: 'created_at', value: oneWeekAgo.toISOString() }];
        const weeklyNewUsers = await count('users', weeklyConditions);
        
        // 本月新增用户
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const monthlyConditions = [...conditions, { type: 'gt', column: 'created_at', value: oneMonthAgo.toISOString() }];
        const monthlyNewUsers = await count('users', monthlyConditions);
        
        // 不同角色的用户数量
        const adminCount = await count('users', [...conditions, { type: 'eq', column: 'role', value: 'admin' }]);
        const userCount = await count('users', [...conditions, { type: 'eq', column: 'role', value: 'user' }]);
        
        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                activeUsers,
                weeklyNewUsers,
                monthlyNewUsers,
                roleDistribution: {
                    admin: adminCount,
                    user: userCount
                }
            }
        });
    } catch (error) {
        handleError(res, error, '获取用户统计概览失败');
    }
});

// 获取用户增长趋势数据
router.get('/growth', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        // 获取登录用户信息
        const user = await getUserFromSession(req);
        const conditions = [];
        
        // 如果用户有trader_uuid，则添加筛选条件
        if (user && user.trader_uuid) {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
        }
        const dates = new Date();
            dates.setDate(dates.getDate() - 10);
            dates.setHours(23, 59, 59, 999);
            
            
            const dayConditionstr = [...conditions, 
               
                { type: 'lte', column: 'created_at', value: dates.toISOString()}
            ];
            
            const dailyUserss = await count('users', dayConditionstr);
            oldcount=dailyUserss
            chazhi=dailyUserss
        // 构建过去7天的数据
        const growthData = [];
        for (let i = 9; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(23, 59, 59, 999);
            // const dateStr = date.toISOString().split('T')[0];
            // // 计算当天新增用户
            // const dayStart = new Date(dateStr).toISOString();
            // const dayEnd = new Date(dateStr);
            // //dayEnd.setHours(23, 59, 59, 999);
            
            const dayConditions = [...conditions, 
               
                { type: 'lte', column: 'created_at', value: date.toISOString()}
            ];
            
            const dailyUsers = await count('users', dayConditions);
            
            growthData.push({
                date: date.toISOString().split('T')[0],
                count: dailyUsers
            });
            oldcount=dailyUsers
        }
        
        res.status(200).json({
            success: true,
            data: growthData
        });
    } catch (error) {
        handleError(res, error, '获取用户增长趋势失败');
    }
});

// 获取用户资产分布数据
router.get('/asset-distribution', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        // 获取登录用户信息
        const user = await getUserFromSession(req);
        const conditions = [];
        
        // 如果用户有trader_uuid，则添加筛选条件
        if (user && user.trader_uuid) {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
        }
        
        // 资产区间分布
        const assetRanges = [
            { min: 0, max: 100000, label: '0-100000' },
            { min: 100000, max: 500000, label: '100000-500000' },
            { min: 500000, max: 1000000, label: '500000-1000000' },
            { min: 1000000, max: Infinity, label: '1000000+' }
        ];
        
        const assetDistribution = [];
        for (const range of assetRanges) {
            const rangeConditions = [...conditions];
            
            if (range.min !== 0) {
                rangeConditions.push({ type: 'gte', column: 'total_asset', value: range.min });
            }
            
            if (range.max !== Infinity) {
                rangeConditions.push({ type: 'lt', column: 'total_asset', value: range.max });
            }
            
            const counts = await count('users', rangeConditions);
            
            assetDistribution.push({
                range: range.label,
                count: counts
            });
        }
        
        res.status(200).json({
            success: true,
            data: assetDistribution
        });
    } catch (error) {
        handleError(res, error, '获取用户资产分布失败');
    }
});

module.exports = router;