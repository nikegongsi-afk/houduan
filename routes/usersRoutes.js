const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { select, insert, update, delete: deleteData, count } = require('../config/supabase');
const { getUserFromSession, checkUserRole, handleError, formatDatetime, authenticateUser, authorizeAdmin } = require('../middleware/auth');
const { get_trader_points_rules, update_user_points } = require('../config/rulescommon');

// 测试COUNT查询的路由 - 临时用于调试
router.get('/test-count', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const conditions = [];
        
        // 查询总记录数
        const total = await count('users', conditions);
        
        res.status(200).json({ success: true, total: total });
    } catch (error) {
        handleError(res, error, '测试COUNT查询失败');
    }
});

// 获取所有用户 - 需要登录和管理员权限
router.get('/', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        console.log(req.user)
         // 检查用户角色是否为admin或superadmin
        if (!await checkUserRole(req.user)) {
            return res.status(403).json({ success: false, message: '权限不足，需要管理员权限' });
        }
        const { limit = 10, offset = 0, search = '', status, role, name } = req.query;
        
        const conditions = [];
        // 加入删除状态筛选
        conditions.push({ type: 'eq', column: 'isdel', value: false });

        if (search) {
            conditions.push({ type: 'like', column: 'username', value: `%${search}%` });
        }
        if (name) {
            conditions.push({ type: 'like', column: 'username', value: `%${name}%` });
        }
        if (status) {
            conditions.push({ type: 'eq', column: 'status', value: status });
        }
        if (role) {
            conditions.push({ type: 'eq', column: 'role', value: role });
        }
         // 获取登录用户信息
     const user = await getUserFromSession(req);
        console.log(user)
      if (user.role !== 'superadmin') {
            conditions.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
    }
        console.log(conditions)
     // 构建排序
    const orderBy = {'column':'created_at','ascending':false};
        const users = await select('users', '*', conditions,
           parseInt(limit),
            parseInt(offset), orderBy
        );
        
        // 查询总记录数
        const total = await count('users', conditions);
        
        // 格式化数据
        const formattedUsers = users.map(user => ({
             ...user
            // created_at: formatDatetime(user.created_at),
            // updated_at: user.updated_at ? formatDatetime(user.updated_at) : null,
            // last_login: user.last_login ? formatDatetime(user.last_login) : null,
            // settings: user.settings ? JSON.parse(user.settings) : {}
        }));
        
        res.status(200).json({ success: true, data: formattedUsers, total: total });
    } catch (error) {
        handleError(res, error, '获取用户列表失败');
    }
});

// 获取单个用户 - 需要登录和管理员权限
router.get('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const users = await select('users', '*', [
            { type: 'eq', column: 'id', value: id }
        ]);
        
        if (!users || users.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        const user = users[0];
        
        // 格式化数据
        const formattedUser = {
            ...user,
            created_at: formatDatetime(user.created_at),
            updated_at: user.updated_at ? formatDatetime(user.updated_at) : null,
            last_login: user.last_login ? formatDatetime(user.last_login) : null,
            settings: user.settings ? JSON.parse(user.settings) : {}
        };
        
        res.status(200).json({ success: true, data: formattedUser });
    } catch (error) {
        handleError(res, error, '获取用户信息失败');
    }
});

// 创建用户 - 需要登录和管理员权限
router.post('/', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const {
            username, email, password_hash, phonenumber, avatar_url,
            status = 'active', role = 'user',realname,initial_asset,trader_uuid,
            membership_level = '',membership_points=0,signing=false
        } = req.body;
        
        // 验证输入
        if (!username || !email || !password_hash) {
            return res.status(400).json({ success: false, message: '用户名、邮箱和密码不能为空' });
        }
        if(username=='admin')
        {
            return res.status(400).json({ success: false, message: '用户名不能为admin' });
        }
        
        // 检查用户是否已存在
        const existingUsers = await select('users', '*', [
            { type: 'eq', column: 'email', value: email }
        ]);
        
        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: '该邮箱已被注册' });
        }
        
        // 检查用户名是否已存在
        const usernameExists = await select('users', '*', [
            { type: 'eq', column: 'username', value: username }
        ]);
        
        if (usernameExists && usernameExists.length > 0) {
            return res.status(400).json({ success: false, message: '该用户名已被使用' });
        }
         const user = await getUserFromSession(req);
        // 创建用户
        const newUser = {
            username:username,
            email:email,
            password_hash:password_hash,
            avatar_url:avatar_url,
            status:status,
            role:role,
            realname:realname,
            phonenumber:phonenumber,
            membership_level:membership_level,
            initial_asset: parseFloat(initial_asset) || 0,
            membership_points:parseInt(membership_points) || 0,
            trader_uuid: trader_uuid,
            signing:signing
        };
        if(user.trader_uuid)
        {
            newUser.trader_uuid=user.trader_uuid
        }
        
        const insertedUsers = await insert('users', newUser);
        
        res.status(201).json({ success: true, message: '用户创建成功', data: insertedUsers[0] });
    } catch (error) {
        handleError(res, error, '创建用户失败');
    }
});

// 更新用户 - 需要登录和管理员权限
router.put('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const {
           username, email, password_hash, phonenumber, avatar_url,
            status = 'active', role = 'user',realname,initial_asset,
            membership_level = '',membership_points=0,signing=false
        } = req.body;
        
        // 检查用户是否存在
        const existingUsers = await select('users', '*', [
            { type: 'eq', column: 'id', value: id }
        ]);
        
        if (!existingUsers || existingUsers.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        if(membership_points!=existingUsers[0].membership_points)
        {
            let jifen=membership_points-existingUsers[0].membership_points
            // 更新用户积分
            await update_user_points(req,id,existingUsers[0].membership_points,jifen,`System gift (deduction): ${jifen}`);
        }
        // 检查邮箱是否已被其他用户使用
        if (email && email !== existingUsers[0].email) {
            const emailExists = await select('users', '*', [
                { type: 'eq', column: 'email', value: email },
                { type: 'neq', column: 'id', value: id }
            ]);
            
            if (emailExists && emailExists.length > 0) {
                return res.status(400).json({ success: false, message: '该邮箱已被其他用户使用' });
            }
        }
        
        // 检查用户名是否已被其他用户使用
        if (username && username !== existingUsers[0].username) {
            const usernameExists = await select('users', '*', [
                { type: 'eq', column: 'username', value: username },
                { type: 'neq', column: 'id', value: id }
            ]);
            
            if (usernameExists && usernameExists.length > 0) {
                return res.status(400).json({ success: false, message: '该用户名已被其他用户使用' });
            }
        }
        
        // 创建用户
        const updateData = {
            username:username,
            email:email,
            password_hash:password_hash,
            avatar_url:avatar_url,
            status:status,
            role:role,
            realname:realname,
            phonenumber:phonenumber,
            membership_level:membership_level,
            initial_asset: parseFloat(initial_asset) || 0,
             membership_points:parseInt(membership_points) || 0,
             signing:signing

        };
        if(password_hash=="")
        {
            delete updateData.password_hash
        }
        
        updateData.updated_at = new Date().toISOString();
        
        // 更新用户
        const updatedUsers = await update('users', updateData, [
            { type: 'eq', column: 'id', value: id }
        ]);
        
        res.status(200).json({ success: true, message: '用户更新成功', data: updatedUsers[0] });
    } catch (error) {
        handleError(res, error, '更新用户失败');
    }
});

// 删除用户 - 需要登录和管理员权限
router.delete('/:id', authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        // 检查用户是否存在
        const existingUsers = await select('users', '*', [
            { type: 'eq', column: 'id', value: id }
        ]);
        
        if (!existingUsers || existingUsers.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }

        const filters = [{ type: 'eq', column: 'id', value: id }];
        if (user.role !== 'superadmin') {
            if (!user.trader_uuid) {
                return res.status(403).json({ success: false, message: '当前管理员未绑定交易员UUID，无法删除用户' });
            }
            filters.push({ type: 'eq', column: 'trader_uuid', value: user.trader_uuid });
        }

        // 软删除用户；超级管理员可跨站点删除，普通管理员只能删除本交易员UUID下的用户。
        const deletedUsers = await update('users', { isdel: true, updated_at: new Date().toISOString() }, filters);
        if (!deletedUsers || deletedUsers.length === 0) {
            return res.status(403).json({ success: false, message: '无权删除该用户或用户不属于当前站点' });
        }
        
        res.status(200).json({ success: true, message: '用户删除成功' });
    } catch (error) {
        handleError(res, error, '删除用户失败');
    }
});

// 用户登录接口
router.post('/login', async (req, res) => {
    try {
        const { username, password_hash } = req.body;
        
        // 验证输入
        if (!username || !password_hash) {
            return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
        }
        
        // 查找用户
        const users = await select('users', '*', [
            { type: 'eq', column: 'username', value: username },
            { type: 'eq', column: 'password_hash', value: password_hash }
        ]);
        
        // 检查用户是否存在
        if (!users || users.length === 0) {
            return res.status(401).json({ success: false, message: '用户名或密码错误' });
        }
        
        const user = users[0];
        
        // 检查用户状态
        if (user.status !== 'active') {
            return res.status(401).json({ success: false, message: '用户账号未激活或已被禁用' });
        }
        
        // 更新最后登录时间和IP
        await update('users', {
            last_login: new Date().toISOString(),
            last_login_ip: req.ip,
            updated_at: new Date().toISOString()
        }, [
            { type: 'eq', column: 'id', value: user.id }
        ]);
        
        // 生成session token和过期时间
        const sessionToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期
        
        // 构建用户信息的JSON数据
        const userInfoJson = JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url,
            
            membership_level: user.membership_level,
            created_at: user.created_at,
            last_login: new Date().toISOString()
        });

        // 存储会话信息到user_sessions表
        const sessionData = {
            user_id: user.id,
            session_token: sessionToken,
            expires_at: expiresAt.toISOString(),
            user_agent: req.headers['user-agent'],
            ip_address: req.ip,
            user_info_json: userInfoJson
        };
        
        await insert('user_sessions', sessionData);
        
        // 构建返回的用户信息（不包含敏感信息）
        const userInfo = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url,
            trader_uuid:user.trader_uuid,
            membership_level: user.membership_level,
            created_at: formatDatetime(user.created_at),
            last_login: formatDatetime(new Date())
        };
        
        // 设置cookie存储session token
        res.cookie('session_token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        res.status(200).json({ 
            success: true, 
            message: '登录成功',
            data: userInfo,
            session_token: sessionToken
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '登录失败',
            details: error.message
        });
    }
});

// 管理员登录接口 - 专门用于管理员登录，验证用户是否为admin角色
router.post('/adminlogin', async (req, res) => {
    try {
        const { username, password_hash } = req.body;
        
        // 验证输入
        if (!username || !password_hash) {
            return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
        }
        
        // 查找用户并验证是否为管理员
        const users = await select('users', '*', [
            { type: 'eq', column: 'username', value: username },
            { type: 'eq', column: 'password_hash', value: password_hash },
            { type: 'in', column: 'role', value: ['admin', 'superadmin'] }
        ]);
        console.log(users)
        // 检查用户是否存在且为管理员
        if (!users || users.length === 0) {
            return res.status(401).json({ success: false, message: '管理员账号或密码错误，或该用户不是管理员' });
        }
        
        const user = users[0];
        
        // 检查用户状态
        if (user.status !== 'active') {
            return res.status(401).json({ success: false, message: '管理员账号未激活或已被禁用' });
        }
        
        // 更新最后登录时间和IP
        await update('users', {
            last_login: new Date().toISOString(),
            last_login_ip: req.ip,
            updated_at: new Date().toISOString()
        }, [
            { type: 'eq', column: 'id', value: user.id }
        ]);
        
        // 生成session token和过期时间
        const sessionToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期
        
        // 构建用户信息的JSON数据
        const userInfoJson = JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url,
            membership_level: user.membership_level,
            created_at: user.created_at,
            last_login: new Date().toISOString()
        });

        // 存储会话信息到user_sessions表
        const sessionData = {
            user_id: user.id,
            session_token: sessionToken,
            expires_at: expiresAt.toISOString(),
            user_agent: req.headers['user-agent'],
            ip_address: req.ip,
            user_info_json: userInfoJson
        };
        
        await insert('user_sessions', sessionData);
        
        // 构建返回的管理员信息
        const adminInfo = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            trader_uuid:user.trader_uuid,
            avatar_url: user.avatar_url,
            created_at: formatDatetime(user.created_at),
            last_login: formatDatetime(new Date()),
            admin_access: true // 标识为管理员访问
        };
        
        // 设置cookie存储session token
        res.cookie('session_token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/' 
        });
        
        res.status(200).json({ 
            success: true, 
            message: '管理员登录成功',
            data: adminInfo,
            session_token: sessionToken
        });
    } catch (error) {
        console.error('管理员登录失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '管理员登录失败',
            details: error.message
        });
    }
});

// 用户登出接口
router.post('/logout', async (req, res) => {
    try {
        // 从cookie或请求体中获取session token
        const sessionToken = req.cookies?.session_token || req.body.session_token;
        
        if (!sessionToken) {
            return res.status(400).json({ success: false, message: '无效的会话令牌' });
        }
        
        // 从user_sessions表中删除会话记录
        await deleteData('user_sessions', [
            { type: 'eq', column: 'session_token', value: sessionToken }
        ]);
        
        // 清除cookie
        res.clearCookie('session_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/'
        });
        
        res.status(200).json({ success: true, message: '登出成功' });
    } catch (error) {
        console.error('登出失败:', error);
        res.status(500).json({ success: false, message: '登出失败' });
    }
});

// 获取用户菜单接口
router.get('/menu', authenticateUser, async (req, res) => {
    try {
        // 这里可以根据用户角色返回不同的菜单
        // 目前返回所有系统菜单
        const menus = [
            {
                id: '/system',
                icon: "layui-icon-set",
                title: '系统管理',
                children: [
                    {
                        id: '/system/user',
                        icon: "layui-icon-user",
                        title: '用户管理',
                    },
                    {
                        id: '/system/traderProfiles',
                        icon: "layui-icon-user",
                        title: '交易者档案管理',
                    },
                    {
                        id: '/system/video',
                        icon: "layui-icon-video",
                        title: '视频管理',
                    },
                    {
                        id: '/system/documents',
                        icon: "layui-icon-file",
                        title: '文档管理',
                    },
                    {
                        id: '/system/aiStockPicker',
                        icon: "layui-icon-android",
                        title: 'AI股票选股',
                    },
                    {
                        id: '/system/announcement',
                        icon: "layui-icon-notice",
                        title: '公告管理',
                    },
                    {
                        id: '/system/contactRecord',
                        icon: "layui-icon-dialogue",
                        title: '联系记录管理',
                    },
                    {
                        id: '/system/membershipLevel',
                        icon: "layui-icon-diamond",
                        title: '会员等级管理',
                    },
                    {
                        id: '/system/trade',
                        icon: "layui-icon-rmb",
                        title: '交易管理',
                    },
                    {
                        id: '/system/leaderboardTraders',
                        icon: "layui-icon-ranking",
                        title: '交易员排行榜管理',
                    },
                    {
                        id: '/system/partnerOrganizations',
                        icon: "layui-icon-link",
                        title: '合作单位管理',
                    }
                ]
            }
        ];
        
        res.status(200).json({ success: true, data: menus });
    } catch (error) {
        handleError(res, error, '获取菜单失败');
    }
});

// 获取用户权限接口
router.get('/permission', authenticateUser, async (req, res) => {
    try {
        // 这里可以根据用户角色返回不同的权限
        const permissions = ['sys:user:add', 'sys:user:edit', 'sys:user:delete', 'sys:user:import', 'sys:user:export'];
        
        res.status(200).json({ success: true, data: permissions });
    } catch (error) {
        handleError(res, error, '获取权限失败');
    }
});

// 获取当前登录用户信息接口
router.post('/me', async (req, res) => {
    try {
         console.log(req)
        // 从cookie或请求头中获取session token
        const sessionToken = req.cookies?.session_token || req.headers['session-token'];
       
        if (!sessionToken) {
            return res.status(401).json({ success: false, message: '用户未登录' });
        }
        
        // 查询有效的会话
        const now = new Date().toISOString();
        const sessions = await select('user_sessions', '*', [
            { type: 'eq', column: 'session_token', value: sessionToken },
            { type: 'gt', column: 'expires_at', value: now }
        ]);
       
        if (!sessions || sessions.length === 0) {
            // 会话无效或已过期，清除cookie
            res.clearCookie('session_token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                path: '/'
            });
            return res.status(401).json({ success: false, message: '会话已过期，请重新登录' });
        }
        
        const session = sessions[0];
        
        // 查询用户信息
        const users = await select('users', 'id, username, email, role, avatar_url, membership_level, created_at, last_login', [
            { type: 'eq', column: 'id', value: session.user_id }
        ]);
        
        if (!users || users.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        
        const user = users[0];
        
        // 构建用户信息的JSON数据
        const userInfoJson = JSON.stringify({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url,
            membership_level: user.membership_level,
            created_at: user.created_at,
            last_login: user.last_login || new Date().toISOString()
        });
        
        // 延长会话有效期并更新用户信息JSON
        const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await update('user_sessions', {
            expires_at: newExpiresAt,
            user_info_json: userInfoJson
        }, [
            { type: 'eq', column: 'session_token', value: sessionToken }
        ]);
        
        // 更新cookie
        res.cookie('session_token', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        res.status(200).json({ success: true, data: users[0] });
    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({ success: false, message: '获取用户信息失败' });
    }
});

module.exports = router;