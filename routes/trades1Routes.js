const express = require('express');
const router = express.Router();
const { select, insert, update,delete:deletedData, count } = require('../config/supabase');
const { getUserFromSession, checkUserRole, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');
const { normalizeShareSize, isShareSizeDbTypeError, shareSizeDbTypeErrorMessage } = require('../config/common');


// 获取所有交易记录数据（带搜索、分页和筛选）
router.get('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    // 处理查询参数
    const { search, trade_market, offset = 0, limit = 10 } = req.query;

    // 构建条件
    const conditions = [];
    if (search) {
      conditions.push({ 'type': 'like', 'column': 'symbol', 'value': search });
    }
    conditions.push({ type: 'eq', column: 'isdel', value: false });
    if (trade_market !== undefined && trade_market !== "") {
      conditions.push({ 'type': 'eq', 'column': 'trade_market', 'value': trade_market });
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    // 如果用户不是超级管理员，并且有trader_uuid，则只返回该trader_uuid的数据
    if (user && user.trader_uuid) {
      conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
    }
    
    // 构建排序
    const orderBy = { 'column': 'id', 'ascending': false };
    
    const trades = await select('trades1', '*', conditions, limit, 
      offset,
      orderBy
    );
    
    // 获取总数用于分页
    const total = await count('trades1', conditions);
    
    res.status(200).json({
      success: true,
      data: trades,
      total: total || 0,
      pages: Math.ceil((total || 0) / limit)
    });
  } catch (error) {
    console.error('获取交易记录数据失败:', error);
    res.status(500).json({ success: false, error: '获取交易记录数据失败', details: error.message });
  }
});

// 获取单个交易记录数据
router.get('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // id是整数类型
    const trades = await select('trades1', '*', [{ 'type': 'eq', 'column': 'id', 'value': id }]);

    if (!trades || trades.length === 0) {
      return res.status(404).json({ success: false, error: '交易记录数据不存在' });
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    // 如果用户不是超级管理员，检查权限
    if (user && user.role !== 'superadmin' && user.trader_uuid !== trades[0].trader_uuid) {
      return res.status(403).json({ success: false, error: '没有权限访问此交易记录' });
    }
    
    res.status(200).json({ success: true, data: trades[0] });
  } catch (error) {
    console.error('获取单个交易记录数据失败:', error);
    res.status(500).json({ success: false, error: '获取单个交易记录数据失败', details: error.message });
  }
});

// 创建新的交易记录数据
router.post('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { symbol, entry_date, entry_price, size, exit_date, exit_price, current_price, image_url, trade_market, direction, is_important } = req.body;
    
    // 输入验证
    if (!symbol || !entry_date || !entry_price || !size) {
      return res.status(400).json({ success: false, error: '缺少必要的字段' });
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    // 获取当前最大ID，避免主键冲突
    const maxIdResult = await select('trades1', 'id', [], 1, 0, { column: 'id', ascending: false });
    const nextId = maxIdResult && maxIdResult.length > 0 ? maxIdResult[0].id + 1 : 1;
    
    const newTrade = await insert('trades1', {
      id: nextId,
      symbol,
      entry_date,
      entry_price,
      size: normalizeShareSize(size),
      exit_date,
      exit_price,
      current_price,
      image_url,
      trade_market,
      direction: direction || 1,
      trader_uuid: user && user.trader_uuid ? user.trader_uuid : null,
      is_important: is_important || false,
      isdel: false
    });
    
    res.status(201).json({ success: true, data: newTrade });
  } catch (error) {
    console.error('创建交易记录数据失败:', error);
    if (isShareSizeDbTypeError(error)) {
      return res.status(400).json({ success: false, error: shareSizeDbTypeErrorMessage(), details: error.message });
    }
    res.status(500).json({ success: false, error: '创建交易记录数据失败', details: error.message });
  }
});

// 更新交易记录数据
router.put('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { symbol, entry_date, entry_price, size, exit_date, exit_price, current_price, image_url, trade_market, direction, is_important } = req.body;
    
    // 检查数据是否存在
    const existingTrade = await select('trades1', '*', [{ 'type': 'eq', 'column': 'id', 'value': id }]);
    if (!existingTrade || existingTrade.length === 0) {
      return res.status(404).json({ success: false, error: '交易记录数据不存在' });
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    console.log('🔍 当前用户信息:', JSON.stringify({ 
      id: user?.id, 
      trader_uuid: user?.trader_uuid, 
      role: user?.role 
    }, null, 2));
    console.log('🔍 现有交易记录的 trader_uuid:', existingTrade[0]?.trader_uuid);
    
    // 检查权限 - 只有管理员或记录所属者可以更新
    if (user && user.trader_uuid !== existingTrade[0].trader_uuid && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '没有权限更新此交易记录' });
    }
    
    const updateData = {};
    
    if (symbol !== undefined) updateData.symbol = symbol;
    if (entry_date !== undefined) updateData.entry_date = entry_date;
    if (entry_price !== undefined) updateData.entry_price = entry_price;
    if (size !== undefined) updateData.size = normalizeShareSize(size);
    if (exit_date !== undefined) updateData.exit_date = exit_date;
    if (exit_price !== undefined) updateData.exit_price = exit_price;
    if (current_price !== undefined) updateData.current_price = current_price;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (trade_market !== undefined) updateData.trade_market = trade_market;
    if (direction !== undefined) updateData.direction = direction;
    
    // ⭐ 关键修复：确保 is_important 字段总是被更新
    // 即使前端发送的是 false，也要明确设置
    if (is_important !== undefined && is_important !== null) {
      updateData.is_important = is_important === true || is_important === 1 || is_important === 'true' || is_important === '1';
    } else {
      // 如果没有提供，默认设置为 false
      updateData.is_important = false;
    }
    
    console.log('📥 接收到的 is_important 原始值:', is_important, '类型:', typeof is_important);
    console.log('🔄 转换后的 is_important 值:', updateData.is_important, '类型:', typeof updateData.is_important);
    console.log('🔄 准备更新数据，updateData:', JSON.stringify(updateData, null, 2));
    console.log('🔄 更新条件:', JSON.stringify([
      { type: 'eq', column: 'id', value: id },
      { type: 'eq', column: 'trader_uuid', value: user.trader_uuid }
    ], null, 2));
    
    // ⚠️ 重要：如果用户是 admin，可能不需要 trader_uuid 条件
    // 先尝试只用 id 更新，如果失败再用 trader_uuid
    let updateFilters = [
      { type: 'eq', column: 'id', value: id }
    ];
    
    // 如果不是超级管理员，添加 trader_uuid 条件
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      updateFilters.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
    }
    
    console.log('🔄 实际使用的更新条件:', JSON.stringify(updateFilters, null, 2));
    
    const updatedTrade = await update('trades1', updateData, updateFilters);
    
    console.log('🔄 update 函数返回的数据:', JSON.stringify(updatedTrade, null, 2));
    console.log('🔄 updatedTrade 是数组?', Array.isArray(updatedTrade));
    console.log('🔄 updatedTrade[0]?.is_important:', updatedTrade && updatedTrade[0]?.is_important);
    
    // 重新查询更新后的数据，确保返回完整信息
    const refreshedTrade = await select('trades1', '*', [
      { type: 'eq', column: 'id', value: id }
    ]);
    
    console.log('🔄 refreshedTrade 查询结果:', JSON.stringify(refreshedTrade, null, 2));
    console.log('🔄 refreshedTrade 是数组?', Array.isArray(refreshedTrade));
    
    // 确保返回的是对象而不是数组
    const returnData = Array.isArray(refreshedTrade) && refreshedTrade.length > 0 
      ? refreshedTrade[0] 
      : (Array.isArray(updatedTrade) && updatedTrade.length > 0 ? updatedTrade[0] : null);
    
    console.log('✅ 最终返回的数据:', JSON.stringify(returnData, null, 2));
    console.log('✅ is_important 字段值:', returnData?.is_important);
    
    if (!returnData) {
      return res.status(500).json({ 
        success: false, 
        error: '更新失败：无法获取更新后的数据' 
      });
    }
    
    res.status(200).json({ 
      success: true, 
      data: returnData,  // 确保返回的是对象，不是数组
      message: '更新成功'
    });
  } catch (error) {
    console.error('更新交易记录数据失败:', error);
    if (isShareSizeDbTypeError(error)) {
      return res.status(400).json({ success: false, error: shareSizeDbTypeErrorMessage(), details: error.message });
    }
    res.status(500).json({ success: false, error: '更新交易记录数据失败', details: error.message });
  }
});

// 删除交易记录数据
router.delete('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
     // 获取登录用户信息
    const user = await getUserFromSession(req);
    // 检查数据是否存在
    const existingTrade = await select('trades1', '*', [{ 'type': 'eq', 'column': 'id', 'value': id },
       { type: 'eq', column: 'trader_uuid', value: user.trader_uuid }]);
    if (!existingTrade || existingTrade.length === 0) {
      return res.status(404).json({ success: false, error: '交易记录数据不存在' });
    }
   
    // 检查权限 - 只有管理员或记录所属者可以删除
    if (user && user.trader_uuid !== existingTrade[0].trader_uuid && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '没有权限删除此交易记录' });
    }
    
    // 删除交易记录
    await update('trades1', { isdel: true }, [
      { type: 'eq', column: 'id', value: id },
       { type: 'eq', column: 'trader_uuid', value: user.trader_uuid }
    ]);
    
    res.status(200).json({ success: true, message: '交易记录数据已成功删除' });
  } catch (error) {
    console.error('删除交易记录数据失败:', error);
    res.status(500).json({ success: false, error: '删除交易记录数据失败', details: error.message });
  }
});

module.exports = router;