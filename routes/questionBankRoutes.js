const express = require('express');
const router = express.Router();
const { select, insert, update, delete: deleteData, count, GLOBAL_TRADER_UUID } = require('../config/supabase');
const { getUserFromSession, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');

const formatQuestion = (question) => {
  const isGlobal = question.trader_uuid === GLOBAL_TRADER_UUID;
  return {
    ...question,
    create_time: formatDatetime(question.create_time),
    correctAnswer: question.correctAnswer !== undefined ? parseInt(question.correctAnswer) : 0,
    disable: question.disable || false,
    is_global: isGlobal,
    scope_label: isGlobal ? '全平台' : '专属',
  };
};

const resolveQuestionTraderUuid = (user) => {
  if (user.role === 'superadmin') {
    return GLOBAL_TRADER_UUID;
  }
  if (!user.trader_uuid) {
    throw new Error('当前管理员未绑定交易员，无法添加专属题目');
  }
  return user.trader_uuid;
};

const buildListConditions = (user, keyword = '') => {
  const conditions = [];
  if (keyword) {
    conditions.push({ type: 'ilike', column: 'question', value: `%${keyword}%` });
  }
  if (user.role !== 'superadmin') {
    conditions.push({
      type: 'in',
      column: 'trader_uuid',
      value: [GLOBAL_TRADER_UUID, user.trader_uuid],
    });
  }
  return conditions;
};

const canManageQuestion = (user, question) => {
  if (user.role === 'superadmin') return true;
  return question.trader_uuid === user.trader_uuid;
};

const normalizeQuestionPayload = (payload, rowIndex) => {
  const prefix = rowIndex !== undefined ? `第 ${rowIndex + 1} 题：` : '';
  const question = String(payload?.question || '').trim();
  const questionimg = String(payload?.questionimg || '').trim();
  const rawOptions = Array.isArray(payload?.options) ? payload.options : [];
  const options = rawOptions.map((item) => String(item || '').trim()).filter(Boolean);
  const correctAnswer = parseInt(payload?.correctAnswer, 10);
  const disable = Boolean(payload?.disable);

  if (!question) {
    throw new Error(`${prefix}题目内容不能为空`);
  }
  if (options.length < 2) {
    throw new Error(`${prefix}至少需要 2 个有效选项`);
  }
  if (Number.isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
    throw new Error(`${prefix}正确答案索引无效（0 表示 A，1 表示 B，以此类推）`);
  }

  return {
    question,
    questionimg,
    options,
    correctAnswer,
    disable,
  };
};

// 获取题库列表 - 需要登录和管理员权限
router.get('/list', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { limit = 10, offset = 0, keyword = '' } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 10;
    const actualOffset = parseInt(offset, 10) || (page - 1) * pageSize;

    const user = await getUserFromSession(req);
    const conditions = buildListConditions(user, keyword);
    const orderBy = { column: 'id', ascending: false };
    const questions = await select('question_bank', '*', conditions, pageSize, actualOffset, orderBy);
    const total = await count('question_bank', conditions);

    res.status(200).json({
      success: true,
      data: {
        list: questions.map((question) => formatQuestion(question)),
        total,
        page,
        pageSize,
      },
    });
  } catch (error) {
    handleError(res, error, '获取题库列表失败');
  }
});

// 批量导入题目
router.post('/batch-import', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供题目数组 questions',
      });
    }

    const user = await getUserFromSession(req);
    const trader_uuid = resolveQuestionTraderUuid(user);
    const now = new Date().toISOString();
    const rows = [];
    const failed = [];

    questions.forEach((item, index) => {
      try {
        const normalized = normalizeQuestionPayload(item, index);
        rows.push({
          ...normalized,
          trader_uuid,
          create_time: now,
        });
      } catch (error) {
        failed.push({
          index: index + 1,
          question: item?.question || '',
          message: error.message,
        });
      }
    });

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有可导入的有效题目',
        data: { imported: 0, failed },
      });
    }

    const insertedData = await insert('question_bank', rows);

    res.status(201).json({
      success: true,
      message: `成功导入 ${insertedData.length} 道题目${failed.length ? `，${failed.length} 道失败` : ''}`,
      data: {
        imported: insertedData.length,
        failed,
        scope: trader_uuid === GLOBAL_TRADER_UUID ? 'global' : 'trader',
        scope_label: trader_uuid === GLOBAL_TRADER_UUID ? '全平台' : '交易员专属',
        list: insertedData.map((question) => formatQuestion(question)),
      },
    });
  } catch (error) {
    handleError(res, error, '批量导入题目失败');
  }
});

// 获取单个题目详情 - 需要登录和管理员权限
router.get('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const questions = await select('question_bank', '*', [
      { type: 'eq', column: 'id', value: id },
    ]);

    if (!questions || questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: '题目不存在',
      });
    }

    res.status(200).json({
      success: true,
      data: formatQuestion(questions[0]),
    });
  } catch (error) {
    handleError(res, error, '获取题目详情失败');
  }
});

// 添加题目 - 需要登录和管理员权限
router.post('/add', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const user = await getUserFromSession(req);
    const normalized = normalizeQuestionPayload(req.body);
    const trader_uuid = resolveQuestionTraderUuid(user);

    const insertedData = await insert('question_bank', {
      ...normalized,
      create_time: new Date().toISOString(),
      trader_uuid,
    });

    res.status(201).json({
      success: true,
      message: '题目添加成功',
      data: formatQuestion(insertedData[0]),
    });
  } catch (error) {
    if (error.message && !error.code) {
      return res.status(400).json({ success: false, message: error.message });
    }
    handleError(res, error, '添加题目失败');
  }
});

// 更新题目 - 需要登录和管理员权限
router.put('/update/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserFromSession(req);
    const existingQuestions = await select('question_bank', '*', [
      { type: 'eq', column: 'id', value: id },
    ]);

    if (!existingQuestions || existingQuestions.length === 0) {
      return res.status(404).json({
        success: false,
        message: '题目不存在',
      });
    }

    if (!canManageQuestion(user, existingQuestions[0])) {
      return res.status(403).json({
        success: false,
        message: '无权修改全平台题目，请联系超级管理员',
      });
    }

    const normalized = normalizeQuestionPayload(req.body);
    const updatedData = await update('question_bank', normalized, [
      { type: 'eq', column: 'id', value: id },
    ]);

    res.status(200).json({
      success: true,
      message: '题目更新成功',
      data: formatQuestion(updatedData[0]),
    });
  } catch (error) {
    if (error.message && !error.code) {
      return res.status(400).json({ success: false, message: error.message });
    }
    handleError(res, error, '更新题目失败');
  }
});

// 删除题目 - 需要登录和管理员权限
router.delete('/delete/:id', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserFromSession(req);
    const existingQuestions = await select('question_bank', '*', [
      { type: 'eq', column: 'id', value: id },
    ]);

    if (!existingQuestions || existingQuestions.length === 0) {
      return res.status(404).json({
        success: false,
        message: '题目不存在',
      });
    }

    if (!canManageQuestion(user, existingQuestions[0])) {
      return res.status(403).json({
        success: false,
        message: '无权删除全平台题目，请联系超级管理员',
      });
    }

    const deleteFilters = [{ type: 'eq', column: 'id', value: id }];
    if (user.role !== 'superadmin') {
      deleteFilters.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
    }

    await deleteData('question_bank', deleteFilters);

    res.status(200).json({
      success: true,
      message: '题目删除成功',
    });
  } catch (error) {
    handleError(res, error, '删除题目失败');
  }
});

// 切换题目状态 - 需要登录和管理员权限
router.put('/:id/toggle', authenticateUser, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserFromSession(req);
    const questions = await select('question_bank', '*', [
      { type: 'eq', column: 'id', value: id },
    ]);

    if (!questions || questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: '题目不存在',
      });
    }

    if (!canManageQuestion(user, questions[0])) {
      return res.status(403).json({
        success: false,
        message: '无权修改全平台题目状态，请联系超级管理员',
      });
    }

    const newStatus = !questions[0].disable;
    await update('question_bank', { disable: newStatus }, [{ type: 'eq', column: 'id', value: id }]);

    res.status(200).json({
      success: true,
      message: newStatus ? '题目已禁用' : '题目已启用',
      data: { disable: newStatus },
    });
  } catch (error) {
    handleError(res, error, '切换题目状态失败');
  }
});

module.exports = router;
