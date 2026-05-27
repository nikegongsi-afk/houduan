const express = require('express');
const router = express.Router();
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');
const {get_device_fingerprint} = require('../../config/common');
const {get_trader_points_rules,update_user_points} = require('../../config/rulescommon');
const { select, insert, update, delete: del, count,Web_Trader_UUID } = require('../../config/supabase');

// 用户登录接口
router.post('/', async (req, res) => {
   try {
        const { username, password_hash } = req.body;
        
        // 验证输入
        if (!username || !password_hash) {
            return res.status(400).json({ success: false, message: 'Username and password cannot be empty' });
        }
        const where=[
            { type: 'eq', column: 'username', value: username },
            { type: 'eq', column: 'password_hash', value: password_hash },
            
        ]
         if(username!='admin'){
           where.push({ type: 'eq', column: 'trader_uuid', value: req.headers['web-trader-uuid'] })
        }
        // 查找用户并验证是否为管理员
        const users = await select('users', '*', where);
       
        console.log(users)
        // 检查用户是否存在且为管理员
        if (!users || users.length === 0) {
            return res.status(200).json({ success: false, message: 'Admin account or password is incorrect, or the user is not an admin' });
        }
        
        const user = users[0];
        
        // 检查用户状态
        if (user.status !== 'active') {
            return res.status(200).json({ success: false, message: 'Admin account is not activated or has been disabled' });
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
            last_login: new Date().toISOString(),
            signing:user.signing
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
        const user_sessions = await select('user_sessions', '*', [
            { type: 'eq', column: 'user_id', value: user.id }
        ]);
        console.log(user_sessions)
        if (user_sessions && user_sessions.length > 0) {
            console.log('删除旧会话:',user.id);
            await del('user_sessions', [
                { type: 'eq', column: 'user_id', value: user.id }
            ]);
        }
       
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
            admin_access: true, // 标识为管理员访问
            signing:user.signing
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
            message: 'Admin login successful',
            data: adminInfo,
            session_token: sessionToken
        });
    } catch (error) {
        console.error('Admin login failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Admin login failed',
            details: error.message
        });
    }
});

// 用户注册接口
router.post('/register', async (req, res) => {
    try {
        const { username, password, realname, email, phonenumber, invitationcode } = req.body;
        const trimmedInvitationCode = typeof invitationcode === 'string' ? invitationcode.trim() : '';
        
        // 验证输入（邀请码为可选）
        if (!username || !password || !realname || !email || !phonenumber) {
            return res.status(400).json({ success: false, message: 'Please enter complete information' });
        }
        
        // 检查用户名是否已存在
        const existingUsers = await select('users', 'id', [
            { type: 'eq', column: 'username', value: username },
            { type: 'eq', column: 'trader_uuid', value: req.headers['web-trader-uuid'] }
        ]);
        
        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'The username has already been used!' });
        }
        
        // 检查邮箱是否已存在
        const existingEmails = await select('users', 'id', [
            { type: 'eq', column: 'email', value: email }
        ]);
        
        if (existingEmails && existingEmails.length > 0) {
            return res.status(400).json({ success: false, message: 'Email has been registered' });
        }

        // 填写了邀请码时才校验
        let existinginvitationcode = null;
        if (trimmedInvitationCode) {
            existinginvitationcode = await select('invitation_code', 'id', [
                { type: 'eq', column: 'code', value: trimmedInvitationCode },
                { type: 'eq', column: 'isuse', value: false },
                { type: 'eq', column: 'trader_uuid', value: req.headers['web-trader-uuid'] }
            ]);

            if (!existinginvitationcode || existinginvitationcode.length <= 0) {
                return res.status(400).json({ success: false, message: 'Please contact customer service to obtain the correct invitation code' });
            }
        }
        
        // 获取用户积分规则
        const pointsRules = await get_trader_points_rules(req);
        
        // 准备用户数据
        const now = new Date().toISOString();
        const userData = {
            username: username,
            password_hash: password,
            realname: realname,
            email: email,
            phonenumber: phonenumber,
            role: 'user', // 默认普通用户角色
            status: 'active', // 默认激活状态
            membership_points: 0,
            trader_uuid: req.headers['web-trader-uuid']  // 使用配置中的Web_Trader_UUID
        };
         // 插入新用户
        const insertedUser = await insert('users', userData);
        //赠送用户注册积分
        await update_user_points(req,insertedUser[0].id,0,pointsRules.register_points,'New Member registration');
       
        
        if (!insertedUser || insertedUser.length === 0) {
            return res.status(500).json({ success: false, message: 'Registration failed, please try again' });
        }

        if (existinginvitationcode && existinginvitationcode.length > 0) {
            await update('invitation_code', {
                isuse: true,
                user_id: insertedUser[0].id,
                username: insertedUser[0].username,
                used_time: new Date().toISOString()
            }, [
                { type: 'eq', column: 'id', value: existinginvitationcode[0].id }
            ]);
        }
        
        // 构建返回的用户信息
        const registeredUser = {
            id: insertedUser[0].id,
            username: insertedUser[0].username,
            realname: insertedUser[0].realname,
            email: insertedUser[0].email,
            phonenumber: insertedUser[0].phonenumber,
            role: insertedUser[0].role,
            status: insertedUser[0].status,
            created_at: insertedUser[0].created_at
        };
        
        res.status(201).json({
            success: true,
            message: 'User registration successful',
            data: registeredUser
        });
    } catch (error) {
        console.error('User registration failed:', error);
        res.status(500).json({
            success: false,
            message: 'User registration failed',
            details: error.message
        });
    }
});

// 格式化日期时间函数
function formatDatetime(dateString) {
    if (!dateString) return '-';
    return moment(dateString).format('YYYY-MM-DD HH:mm:ss');
}

module.exports = router;