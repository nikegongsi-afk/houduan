const express = require('express');
const router = express.Router();
const { select, insert, update,delete:deleteData, count } = require('../config/supabase');
const { getUserFromSession, checkUserRole, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');


// 获取所有文档数据（带搜索、分页和筛选）
router.get('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    // 处理查询参数
    const { search, ispublic,offset = 0, limit = 10 } = req.query;
   
    // 构建条件
    const conditions = [];
    if (search) {
      conditions.push({'type':'like','column':'ILIKE','value':search});
    }
    if (ispublic !== undefined && ispublic!="") {
      conditions.push({'type':'eq','column':'ispublic','value':ispublic});
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    
    
   // 如果用户不是超级管理员，并且有trader_uuid，则只返回该trader_uuid的数据
        if (user.role !== 'superadmin') {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
        }
    // 构建排序
    const orderBy = {'column':'id','ascending':false};
    
    const documents = await select('documents', '*', conditions, limit,
      offset,
      orderBy
    );
    
    // 获取总数用于分页
    const total = await count('documents', conditions);
    
    res.status(200).json({
      success: true,
      data: documents,
      total: total || 0,
      pages: Math.ceil((total || 0) / limit)
    });
  } catch (error) {
    console.error('获取文档数据失败:', error);
    res.status(500).json({ success: false, error: '获取文档数据失败', details: error.message });
  }
});

// 获取单个文档数据
router.get('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // id是整数类型
    const documents = await select('documents', '*', [{'type':'eq','column':'id','value':id}]);

    if (!documents || documents.length === 0) {
      return res.status(404).json({ success: false, error: '文档数据不存在' });
    }
    
    res.status(200).json({ success: true, data: documents[0] });
  } catch (error) {
    console.error('获取单个文档数据失败:', error);
    res.status(500).json({ success: false, error: '获取单个文档数据失败', details: error.message });
  }
});

// 创建新的文档数据
router.post('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, file_url, file_type, ispublic } = req.body;

    if (!title || !file_url) {
      return res.status(400).json({ success: false, error: '缺少必要的字段' });
    }
    
    const user = await getUserFromSession(req);
    
    const newDocument = await insert('documents', {
      title,
      description,
      file_url,
      file_type,
      views: 0,
      trader_uuid: user && user.trader_uuid ? user.trader_uuid : null,
      ispublic: ispublic !== undefined ? ispublic : 1
    });
    
    res.status(201).json({ success: true, message: '新增成功', data: newDocument });
  } catch (error) {
    console.error('创建文档数据失败:', error);
    res.status(500).json({ success: false, error: '创建文档数据失败', details: error.message });
  }
});

// 更新文档数据
router.put('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, file_url, file_type, ispublic } = req.body;

    const existingDocument = await select('documents', '*', [{'type':'eq','column':'id','value':id}]);
    if (!existingDocument || existingDocument.length === 0) {
      return res.status(404).json({ success: false, error: '文档数据不存在' });
    }
    
    const user = await getUserFromSession(req);
    
    if (user && user.trader_uuid !== existingDocument[0].trader_uuid && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: '没有权限更新此文档' });
    }
    
    const updateData = { last_update: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (file_url !== undefined) updateData.file_url = file_url;
    if (file_type !== undefined) updateData.file_type = file_type;
    if (ispublic !== undefined) updateData.ispublic = ispublic;

    const updatedDocument = await update('documents', updateData, [
      { type: 'eq', column: 'id', value: id }
    ]);
    res.status(200).json({ success: true, message: '更新成功', data: updatedDocument });
  } catch (error) {
    console.error('更新文档数据失败:', error);
    res.status(500).json({ success: false, error: '更新文档数据失败', details: error.message });
  }
});

// 删除文档数据
router.delete('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查数据是否存在
    const existingDocument = await select('documents', '*', [`id = ${id}`]);
    if (!existingDocument || existingDocument.length === 0) {
      return res.status(404).json({ success: false, error: '文档数据不存在' });
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    // 检查权限 - 只有管理员或文档所属者可以删除
    if (user && user.trader_uuid !== existingDocument[0].trader_uuid && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '没有权限删除此文档' });
    }
    
   
     // 删除用户
        await deleteData('documents', [
            { type: 'eq', column: 'id', value: id } ,{ type: 'eq', column: 'trader_uuid', value: req.user.trader_uuid }
        ]);
    res.status(200).json({ success: true, message: '文档数据已成功删除' });
  } catch (error) {
    console.error('删除文档数据失败:', error);
    res.status(500).json({ success: false, error: '删除文档数据失败', details: error.message });
  }
});

module.exports = router;