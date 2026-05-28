const express = require('express');
const router = express.Router();
const { select, insert, update, delete:deleteData, count } = require('../config/supabase');
const { getUserFromSession, checkUserRole, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');


// 获取所有视频数据（带搜索、分页和筛选）
router.get('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    // 处理查询参数
    const { search, ispublic, offset = 0, limit = 10 } = req.query;

    
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
    
    
     if (user.role !== 'superadmin') {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
    }
    
    // 构建排序
    const orderBy = {'column':'id','ascending':false};
    
    const videos = await select('videos', '*', conditions, limit,
      offset,
      orderBy
    );
    
    // 获取总数用于分页
    const total = await count('videos', conditions);
    
    res.status(200).json({
      success: true,
      data: videos,
      total: total || 0,
      pages: Math.ceil((total || 0) / limit)
    });
  } catch (error) {
    console.error('获取视频数据失败:', error);
    res.status(500).json({ success: false, error: '获取视频数据失败', details: error.message });
  }
});

// 获取单个视频数据
router.get('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // id是整数类型
    const videos = await select('videos', '*', [{'type':'eq','column':'id','value':id}]);

    if (!videos || videos.length === 0) {
      return res.status(404).json({ success: false, error: '视频数据不存在' });
    }
    
    res.status(200).json({ success: true, data: videos[0] });
  } catch (error) {
    console.error('获取单个视频数据失败:', error);
    res.status(500).json({ success: false, error: '获取单个视频数据失败', details: error.message });
  }
});

// 创建新的视频数据
router.post('/', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { title, description, video_url, ispublic } = req.body;

    if (!title || !video_url) {
      return res.status(400).json({ success: false, error: '缺少必要的字段' });
    }
    
    const user = await getUserFromSession(req);
    
    const newVideo = await insert('videos', {
      title,
      description,
      video_url,
      trader_uuid: user && user.trader_uuid ? user.trader_uuid : null,
      ispublic: ispublic !== undefined ? ispublic : 1
    });
    
    res.status(201).json({ success: true, message: '新增成功', data: newVideo });
  } catch (error) {
    console.error('创建视频数据失败:', error);
    res.status(500).json({ success: false, error: '创建视频数据失败', details: error.message });
  }
});

// 更新视频数据
router.put('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, video_url, ispublic } = req.body;

    const existingVideo = await select('videos', '*', [{'type':'eq','column':'id','value':id}]);
    if (!existingVideo || existingVideo.length === 0) {
      return res.status(404).json({ success: false, error: '视频数据不存在' });
    }
    
    const user = await getUserFromSession(req);
    
    if (user && user.trader_uuid !== existingVideo[0].trader_uuid && user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: '没有权限更新此视频' });
    }
    
    const updateData = { last_update: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (video_url !== undefined) updateData.video_url = video_url;
    if (ispublic !== undefined) updateData.ispublic = ispublic;
    
    const updatedVideo = await update('videos', updateData, [
      { type: 'eq', column: 'id', value: id }
    ]);
    
    res.status(200).json({ success: true, message: '更新成功', data: updatedVideo });
  } catch (error) {
    console.error('更新视频数据失败:', error);
    res.status(500).json({ success: false, error: '更新视频数据失败', details: error.message });
  }
});

// 删除视频数据
router.delete('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查数据是否存在
    const existingVideo = await select('videos', '*', [{'type':'eq','column':'id','value':id}]);
    if (!existingVideo || existingVideo.length === 0) {
      return res.status(404).json({ success: false, error: '视频数据不存在' });
    }
    
    // 获取登录用户信息
    const user = await getUserFromSession(req);
    
    // 检查权限 - 只有管理员或视频所属者可以删除
    if (user && user.trader_uuid !== existingVideo[0].trader_uuid && user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '没有权限删除此视频' });
    }
    
    // 删除视频
    await deleteData('videos', [
        { type: 'eq', column: 'id', value: id } ,{ type: 'eq', column: 'trader_uuid', value: req.user.trader_uuid }
    ]);
    
    res.status(200).json({ success: true, message: '视频数据已成功删除' });
  } catch (error) {
    console.error('删除视频数据失败:', error);
    res.status(500).json({ success: false, error: '删除视频数据失败', details: error.message });
  }
});

module.exports = router;