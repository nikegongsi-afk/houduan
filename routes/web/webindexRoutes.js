const express = require('express');
const router = express.Router();
const moment = require('moment');
const {get_device_fingerprint} = require('../../config/common');
const { select, insert, update, delete: del, count,Web_Trader_UUID, supabase } = require('../../config/supabase');
const { getUserFromSession } = require('../../middleware/auth');
const {get_trader_points_rules,update_user_points} = require('../../config/rulescommon');
const { toCountryZh, resolveCityZh } = require('../../config/visitLocationZh');
// 获取交易员信息数据
router.get('/trader_profiles', async (req, res) => {
  try {
      const Web_Trader_UUID = req.headers['web-trader-uuid'];
      const conditions = [];
      console.log(Web_Trader_UUID)
      conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
      // 加入删除状态筛选
      conditions.push({ type: 'eq', column: 'isdel', value: false });
      // const orderBy = {'column':'id','ascending':false};
      const users = await select('trader_profiles', '*', conditions,
          null,
            null, null
        );
      res.status(200).json({ 
        success: true, 
        data:{
          trader_profiles: users[0],
        }
      });
  } catch (error) {
    handleError(res, error, 'Failed to fetch data');
  }
});

// 获取网站首页数据
router.get('/index', async (req, res) => {
  try {
    // 获取一年前的日期
    
     const Web_Trader_UUID = req.headers['web-trader-uuid'];
      const conditions = [];
     
      conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
      // const orderBy = {'column':'id','ascending':false};
      const users = await select('trader_profiles', '*', conditions,
          null,
            null, null
        );
      
      // 检查用户是否存在
      if (!users || users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Trader profile not found'
        });
      }
      
      let orderBy = {'column':'updated_at','ascending':false};
      const strategy_info= await select('trading_strategies', '*', conditions,
          1,
            0, orderBy
        );
       orderBy = {'column':'id','ascending':false};
      // 获取一年前的日期
      const oneYearAgo = moment().subtract(1, 'year').format('YYYY-MM-DD HH:mm:ss');
      console.log("oneYearAgo:",oneYearAgo);
      // 复制conditions数组以避免影响其他查询
      const tradeConditions = [...conditions];
    
      // 添加entry_date为一年以内的条件
      tradeConditions.push({ type: 'gte', column: 'entry_date', value: oneYearAgo });
        console.log("tradeConditions:",tradeConditions)
      let trades=null
      try{
      trades= await select('view_trader_trade', '*', tradeConditions,
          null,
            null, orderBy
        );
      }
      catch(error){
        console.error('Failed to fetch trades:', error);
      }
      console.log("trades:",trades)
      // 确保 trades 是数组
      if (!trades) {
        trades = [];
      }
       
      // 调试：检查 is_important 字段是否存在
      if (trades && trades.length > 0) {
        console.log('📊 查询到的交易记录数量:', trades.length);
        console.log('📊 第一条记录的字段:', Object.keys(trades[0]));
        console.log('📊 第一条记录的 is_important 值:', trades[0].is_important);
        const importantCount = trades.filter(t => t.is_important === true || t.is_important === 1).length;
        console.log('📊 重点交易记录数量:', importantCount);
      }
       
      // 未平仓交易：始终拉取最新实时价格（避免 current_price=entry_price 时不更新）
      const { get_real_time_price } = require('../../config/common');
      for (const trade of trades) {
        if (!trade.exit_price && !trade.exit_date) {
          try {
            const latestPrice = await get_real_time_price(trade.trade_market, trade.symbol);
            if (latestPrice && latestPrice > 0) {
              trade.current_price = latestPrice;
              console.log(`✅ 实时获取 ${trade.symbol} 价格: $${latestPrice}`);
            }
          } catch (error) {
            console.error(`❌ 获取 ${trade.symbol} 价格失败:`, error.message);
          }
        }
      }
       
         // 格式化公告数据
        trades = trades.map(item => {
            // 处理 current_price 为 null、0 或无效值的情况
            let effectivePrice = item.current_price;
            if (!effectivePrice || effectivePrice === 0 || isNaN(effectivePrice)) {
                // 如果 current_price 无效，使用 entry_price 作为默认值
                effectivePrice = item.entry_price || 0;
            }
            
            // 判断是否已平仓
            const isClosed = item.exit_price && item.exit_date;
            const priceForCalc = isClosed ? item.exit_price : effectivePrice;
            
            // 计算 Market_Value
            const marketValue = (priceForCalc * item.size).toFixed(2);
            
            // 计算 Ratio (盈亏比例)
            let ratio = '0.00';
            if (item.entry_price && item.entry_price > 0) {
                ratio = ((priceForCalc - item.entry_price) / item.entry_price * 100).toFixed(2);
            }
            
            // 计算 Amount (盈亏金额)
            const amount = ((priceForCalc - item.entry_price) * item.size * (item.direction || 1)).toFixed(2);
            
            // 判断状态
            let status = "Active";
            if (isClosed) {
                const profit = parseFloat(amount);
                if (profit > 0) {
                    status = "Take Profit";
                } else if (profit < 0) {
                    status = "Stop Loss";
                } else {
                    status = "Closed";
                }
            }
            
            return {
                ...item,
                current_price: effectivePrice, // 更新为有效价格
                Market_Value: marketValue,
                Ratio: ratio,
                Amount: amount,
                status: status,
            };
        });
      
      // 在后端进行排序：重点交易置顶
      trades = trades.sort((a, b) => {
        // 首先按重点交易排序：重点交易在前
        const isImportantA = a.is_important === true || a.is_important === 1 || a.is_important === 'true' || a.is_featured === true || a.is_featured === 1;
        const isImportantB = b.is_important === true || b.is_important === 1 || b.is_important === 'true' || b.is_featured === true || b.is_featured === 1;
        
        if (isImportantA !== isImportantB) {
          return isImportantA ? -1 : 1; // 重点交易在前
        }
        
        // 然后按状态排序：Active在前，平仓在后
        const isActiveA = a.status === 'Active';
        const isActiveB = b.status === 'Active';
        
        if (isActiveA !== isActiveB) {
          return isActiveA ? -1 : 1; // Active在前
        }
        
        // 同状态内按时间排序（最新的在前）
        const dateA = isActiveA ? new Date(a.entry_date) : new Date(a.exit_date || a.entry_date);
        const dateB = isActiveB ? new Date(b.entry_date) : new Date(b.exit_date || b.entry_date);
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log('📊 排序后的重点交易数量:', trades.filter(t => t.is_important === true || t.is_important === 1).length);
      console.log('📊 排序后的前3条记录:', trades.slice(0, 3).map(t => ({ symbol: t.symbol, is_important: t.is_important, status: t.status })));
        let Monthly=0
        console.log(moment().add(-1, 'month').format('YYYY-MM-01'))
        const exitList= trades.filter((item)=> !item.exit_date || item.exit_date>=moment().format('YYYY-MM-01'))
        console.log(exitList)
         exitList.forEach((item)=>{
          if(item.status!="Active"){
          Monthly+=parseFloat(item.Amount/item.exchange_rate)
          }
        })
        let Total=0;
         const allList= trades.filter((item)=>item.exit_date)
          allList.forEach((item)=>{
            Total+=parseFloat(item.Amount/item.exchange_rate)
          })
        users[0].total_trades = (users[0].total_trades || 0) + trades.length;
      res.status(200).json({ 
        success: true, 
        data:{
          trader_profiles: users[0],
          strategy_info: strategy_info && strategy_info.length > 0 ? strategy_info[0] : null,
          trades:trades,
          Monthly:Monthly.toFixed(2),
          Total:Total.toFixed(2),
        }
      });
  } catch (error) {
    handleError(res, error, 'Failed to fetch data');
  }
});


// 获取whatsapp信息
router.get('/get-whatsapp-link', async (req, res) => {
  try {
    let whatsagent=null;
    const device_fingerprint = get_device_fingerprint(req);
     
     const Web_Trader_UUID = req.headers['web-trader-uuid'];
      let conditions = [];
      
      conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
      conditions.push({ type: 'eq', column: 'device_fingerprint', value: device_fingerprint });
      // const orderBy = {'column':'id','ascending':false};
     
      let existing_record = await select('contact_records', '*', conditions,
          null,
            null, null
        );
       let agent_id=0;
       console.log(existing_record)
      if(existing_record.length>0)
      {
        
       agent_id = existing_record[0].agent_id;
       
      }
      if(existing_record.length<=0)
      {
        
        conditions = [];
        conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
          const all_agent = await select('view_whatsapp_count', '*', conditions,
          1,
            0, null
        );
       console.log(all_agent)
          agent_id = all_agent[0].id;
         if(all_agent.length>0)
          {
           let insert_data = {
                        'device_fingerprint': device_fingerprint,
                        'agent_id': agent_id,
                        'ip_address': req.ip,
                        'user_agent': req.headers['user-agent'],
                        'trader_uuid':Web_Trader_UUID
                    }
            console.log(insert_data)
            await insert('contact_records', insert_data);
          }
      }
       conditions = [];
        conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });
        conditions.push({ type: 'eq', column: 'id', value: agent_id });
         console.log(conditions)
         existing_record = await select('whatsapp_agents', '*', conditions,
          null,
            null, null
        );
       console.log(existing_record)
        if(existing_record)
        {
          whatsagent=existing_record[0];
        }
     
      res.status(200).json({ 
        success: true, 
        data: `whatsapp://send?phone=${whatsagent.phone_number}`
      });
  } catch (error) {
    handleError(res, error, 'Failed to fetch data');
  }
});




// 处理错误的辅助函数
const handleError = (res, error, message) => {
  console.error(`[ERROR] ${message}:`, error);
  res.status(500).json({
    success: false,
    message: message || 'Internal Server Error'
  });
};

// 获取公告信息
router.get('/announcement', async (req, res) => {
  try {
    const Web_Trader_UUID = req.headers['web-trader-uuid'];
    // 获取最新的公告
    const conditions = [
      { type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID },
      { type: 'eq', column: 'active', value: true },
      { type: 'eq', column: 'popup_enabled', value: true }
    ];
    const orderBy = { column: 'created_at', ascending: false };
    const announcements = await select('announcements', '*', conditions, 1, 0, orderBy);
    
    if (announcements && announcements.length > 0) {
      const announcement = announcements[0];
      // 处理时间格式
      let formattedDate = '';
      if (announcement.created_at) {
        // 在JavaScript中处理UTC时间转本地时间
        const utcDate = new Date(announcement.created_at);
        formattedDate = moment(utcDate).format('MMM D, YYYY');
      }
      
      res.status(200).json({
        success: true,
        announcement: {
          title: announcement.title || 'Important Notice',
          content: announcement.content || 'Welcome to join our trading community!',
          allow_close_dialog: announcement.allow_close_dialog || false,
          date: formattedDate,
          delay_seconds:announcement.delay_seconds
        }
      });
    } else {
      // 如果没有公告，返回默认内容
      const formattedCurrentDate = moment().format('MMM D, YYYY');
      
      res.status(200).json({
        success: false,
        announcement: {
          title: 'Welcome to Join Exclusive Trading Community',
          content: 'Get real-time trading signal alerts, professional strategy analysis, one-on-one trading guidance, and exclusive market analysis reports. Join our exclusive community now and start your path to investment success!',
          date: formattedCurrentDate,
          allow_close_dialog: true,
          delay_seconds:5
        }
      });
    }
  } catch (error) {
    console.error(`[ERROR] Failed to get announcement:`, error);
    // 返回默认内容
    const formattedCurrentDate = moment().format('MMM D, YYYY');
    
    res.status(200).json({
      success: true,
      announcement: {
        title: 'Welcome to Join Exclusive Trading Community',
        content: 'Get real-time trading signal alerts, professional strategy analysis, one-on-one trading guidance, and exclusive market analysis reports.',
        date: formattedCurrentDate,
        allow_close_dialog: true,
        delay_seconds:5
      }
    });
  }
});


// 获取排行榜数据
router.get('/leaderboard', async (req, res) => {
  try {
      const Web_Trader_UUID = req.headers['web-trader-uuid'];
     let sort=req.query.sort;
      if(!sort)
      {
        sort='profit'
      }
      let sortType='';
      switch(sort)
      {
        case 'profit':
          sortType='total_profit'
          break;
        case 'followers':
          sortType='followers_count'
          break;
        case 'likes':
          sortType='likes_count'
          break;
      }
    
      const conditions = [];
     // 获取登录用户信息
       
      conditions.push({ type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID });

       const orderBy = {'column':sortType,'ascending':false};
      const users = await select('leaderboard_traders', '*', conditions,
          null,
            null, orderBy
        );
      res.status(200).json({ 
        success: true, 
        data:users
      });
  } catch (error) {
    handleError(res, error, '获取数据失败');
  }
});

// 交易员点赞接口
router.post('/like-trader', async (req, res) => {
  try {
    const Web_Trader_UUID = req.headers['web-trader-uuid'];
   
     const user=await getUserFromSession(req);
     if(user)
     {
        const pointsRules = await get_trader_points_rules(req);
        await update_user_points(req,user.id,user.membership_points,pointsRules.likes_points,'Members Use likes');
     }
    // 检查点赞记录
    const device_fingerprint = get_device_fingerprint(req);
      // 更新leaderboard_traders表中的点赞数
      const leaderboardConditions = [
        { type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID }
      ];
      let traderProfile = await select('trader_profiles', '*', leaderboardConditions, 1, 0, null);
      likes_count=traderProfile[0].likes_count+1;
      await update('trader_profiles', { likes_count: likes_count }, leaderboardConditions);
      
      return res.status(200).json({
        success: true,
        message: 'Like successful',
        isLiked: true
      });
    
  } catch (error) {
    handleError(res, error, 'Like operation failed');
  }
});

// leaderboard点赞接口
router.post('/like-leaderboard', async (req, res) => {
  try {
    const Web_Trader_UUID = req.headers['web-trader-uuid'];
    const { id } = req.body;
    const user=await getUserFromSession(req);
     if(user)
     {
        const pointsRules = await get_trader_points_rules(req);
        await update_user_points(req,user.id,user.membership_points,pointsRules.likes_points,'Members Use likes');
     }
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Trader ID cannot be empty'
      });
    }
   
      
      // 更新leaderboard_traders表中的点赞数
      const leaderboardConditions = [
        { type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID },
        { type: 'eq', column: 'id', value: id }
      ];
         let traderProfile = await select('leaderboard_traders', '*', leaderboardConditions, 1, 0, null);
      let likes_count=traderProfile[0].likes_count+1;
      await update('leaderboard_traders', { likes_count: likes_count }, leaderboardConditions);
      
      return res.status(200).json({
        success: true,
        message: 'Like successful',
        isLiked: true
      });
    
  } catch (error) {
    handleError(res, error, 'Like operation failed');
  }
});

// 记录页面访问（由 Cloudflare Worker 上报地理位置）
router.post('/track-visit', async (req, res) => {
  try {
    const Web_Trader_UUID = req.headers['web-trader-uuid'] || req.body.trader_uuid;
    const {
      ip_address,
      country,
      city,
      region,
      latitude,
      longitude,
      path,
      visit_host,
      visit_url,
      user_agent,
    } = req.body;

    if (!Web_Trader_UUID) {
      return res.status(400).json({ success: false, message: 'Missing trader uuid' });
    }

    const ip = ip_address || req.ip || null;
    if (!ip) {
      return res.status(400).json({ success: false, message: 'Missing ip address' });
    }

    const lat = latitude === null || latitude === undefined || latitude === ''
      ? null
      : Number(latitude);
    const lng = longitude === null || longitude === undefined || longitude === ''
      ? null
      : Number(longitude);

    const pagePath = path || '/';
    const host = visit_host || null;
    const fullUrl = visit_url || (host ? `https://${host}${pagePath}` : pagePath);
    const countryZh = toCountryZh(country);
    const cityZh = await resolveCityZh(city, Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null);

    const recordData = {
      trader_uuid: Web_Trader_UUID,
      ip_address: ip,
      country: country || null,
      country_zh: countryZh || null,
      city: city || null,
      city_zh: cityZh || null,
      region: region || null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      path: pagePath,
      visit_host: host,
      visit_url: fullUrl,
      user_agent: user_agent || req.headers['user-agent'] || null,
      visited_at: new Date().toISOString(),
    };

    const existingConditions = [
      { type: 'eq', column: 'trader_uuid', value: Web_Trader_UUID },
      { type: 'eq', column: 'ip_address', value: ip },
    ];
    const existing = await select(
      'page_visits',
      '*',
      existingConditions,
      1,
      0,
      { column: 'visited_at', ascending: false }
    );

    if (existing && existing.length > 0) {
      await update('page_visits', recordData, [
        { type: 'eq', column: 'id', value: existing[0].id },
      ]);
      return res.status(200).json({ success: true, updated: true });
    }

    await insert('page_visits', recordData);
    res.status(201).json({ success: true, created: true });
  } catch (error) {
    console.error('记录页面访问失败:', error);
    res.status(500).json({ success: false, message: 'Failed to track visit' });
  }
});

module.exports = router;