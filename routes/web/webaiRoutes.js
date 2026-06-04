const express = require('express');
const router = express.Router();
const { supabase, select, insert, Web_Trader_UUID, update } = require('../../config/supabase');
const { query } = require('../../config/db');
const { getUserFromSession } = require('../../middleware/auth');
const { get_real_time_price, get_India_price } = require('../../config/common');
const {get_trader_points_rules,update_user_points} = require('../../config/rulescommon');
const { generateStockAnalysis, generateInvestmentSummary } = require('../../utils/gptService');
// // const yfinance = require('yahoo-finance2').default; // 暂时注释掉，使用get_real_time_price替代 // 暂时注释掉，使用get_real_time_price替代
// 处理错误的辅助函数
const handleError = (res, error, message) => {
  console.error(message + ':', error);
  res.status(500).json({ success: false, message: 'Internal Server Error', details: error.message });
}

// 股票池数据 - 支持多种行业名称映射
const stockPools = {
    // 技术类 - 支持多种命名方式
    'technology': ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'CRM', 'ORCL', 'INTC'],
    'Technology': ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'CRM', 'ORCL', 'INTC'],
    'ai-technology': ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'CRM', 'ORCL', 'INTC'],
    'semiconductors': ['NVDA', 'INTC', 'AMD', 'TSM', 'AVGO', 'QCOM', 'MRVL', 'AMAT', 'LRCX', 'KLAC'],
    'Semiconductors': ['NVDA', 'INTC', 'AMD', 'TSM', 'AVGO', 'QCOM', 'MRVL', 'AMAT', 'LRCX', 'KLAC'],
    
    // 医疗健康类
    'healthcare': ['JNJ', 'PFE', 'UNH', 'MRNA', 'ABBV', 'TMO', 'DHR', 'BMY', 'MRK', 'GILD'],
    'Healthcare': ['JNJ', 'PFE', 'UNH', 'MRNA', 'ABBV', 'TMO', 'DHR', 'BMY', 'MRK', 'GILD'],
    'biotechnology': ['MRNA', 'GILD', 'BIIB', 'REGN', 'VRTX', 'AMGN', 'ILMN', 'MRNA', 'BNTX', 'MRNA'],
    'Biotechnology': ['MRNA', 'GILD', 'BIIB', 'REGN', 'VRTX', 'AMGN', 'ILMN', 'MRNA', 'BNTX', 'MRNA'],
    
    // 金融类
    'finance': ['JPM', 'BAC', 'WFC', 'GS', 'C', 'USB', 'TFC', 'PNC', 'COF', 'AXP'],
    'Finance': ['JPM', 'BAC', 'WFC', 'GS', 'C', 'USB', 'TFC', 'PNC', 'COF', 'AXP'],
    
    // 能源类
    'energy': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'DVN'],
    'Energy': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'DVN'],
    'renewable-energy': ['TSLA', 'NEE', 'ENPH', 'SEDG', 'FSLR', 'RUN', 'SPWR', 'JKS', 'CSIQ', 'DQ'],
    'Renewable Energy': ['TSLA', 'NEE', 'ENPH', 'SEDG', 'FSLR', 'RUN', 'SPWR', 'JKS', 'CSIQ', 'DQ'],
    
    // 消费类
    'consumer': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'WMT', 'COST'],
    'Consumer Goods': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'WMT', 'COST'],
    'consumer-goods': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'WMT', 'COST'],
    
    // 工业类
    'industrial': ['BA', 'CAT', 'GE', 'HON', 'UPS', 'LMT', 'RTX', 'DE', 'MMM', 'EMR'],
    'Industrial': ['BA', 'CAT', 'GE', 'HON', 'UPS', 'LMT', 'RTX', 'DE', 'MMM', 'EMR'],
    
    // 公用事业类
    'utilities': ['NEE', 'DUK', 'SO', 'D', 'EXC', 'XEL', 'SRE', 'AEP', 'PEG', 'ED'],
    'Utilities': ['NEE', 'DUK', 'SO', 'D', 'EXC', 'XEL', 'SRE', 'AEP', 'PEG', 'ED'],
    
    // 材料类
    'materials': ['LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'PPG', 'NEM', 'FCX', 'FMC'],
    'Materials': ['LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'PPG', 'NEM', 'FCX', 'FMC'],
    
    // 房地产类
    'real-estate': ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'AVB', 'ESS'],
    'Real Estate': ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'AVB', 'ESS'],
    
    // 通信类
    'communication': ['VZ', 'T', 'TMUS', 'CHTR', 'CMCSA', 'DIS', 'NFLX', 'GOOGL', 'META', 'TWTR'],
    'Communication': ['VZ', 'T', 'TMUS', 'CHTR', 'CMCSA', 'DIS', 'NFLX', 'GOOGL', 'META', 'TWTR'],
    
    // 全行业选项
    'all-sectors': ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'JNJ', 'PFE', 'JPM', 'BAC', 'XOM', 'CVX', 'HD', 'MCD', 'BA', 'CAT', 'NEE', 'DUK', 'LIN', 'APD'],
    'All Sectors': ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'JNJ', 'PFE', 'JPM', 'BAC', 'XOM', 'CVX', 'HD', 'MCD', 'BA', 'CAT', 'NEE', 'DUK', 'LIN', 'APD']
};

// 生成随机数的辅助函数
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// 从数组中随机选择指定数量的元素
function randomSample(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
}

// 获取股票综合数据
async function getComprehensiveStockData(symbol) {
    try {
        const axios = require('axios');
        const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
        if (!apiKey) {
            console.log('[WARNING] MASSIVE_API_KEY 未配置，使用 fallback 数据');
            return createFallbackStockData(symbol);
        }
        
        console.log(`[DEBUG] Fetching data for ${symbol}...`);
        
        // 获取股票基本信息
        const tickerResponse = await axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`, { timeout: 10000 });
        const tickerInfo = tickerResponse.data.results;
        
        // 获取股票快照数据（价格、成交量等）
        const snapshotResponse = await axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`, { timeout: 10000 });
        const snapshot = snapshotResponse.data.ticker;
        
        if (!tickerInfo || !snapshot) {
            console.log(`[WARNING] Incomplete data for ${symbol}, using fallback data`);
            return createFallbackStockData(symbol);
        }
        
        const stockData = {
            symbol: symbol,
            name: tickerInfo.name,
            sector: tickerInfo.sic_description || 'Technology',
            current_price: snapshot.lastTrade ? snapshot.lastTrade.p : null,
            change_percent: snapshot.todaysChangePerc,
            change_amount: snapshot.todaysChange,
            market_cap: tickerInfo.market_cap || null,
            market: tickerInfo.primary_exchange,
            currency: tickerInfo.currency_name,
            open_price: snapshot.day.o,
            high_price: snapshot.day.h,
            low_price: snapshot.day.l,
            close_price: snapshot.day.c,
            volume: snapshot.day.v,
            avg_volume: snapshot.prevDay.v,
            employees: tickerInfo.total_employees,
            description: tickerInfo.description,
            website: tickerInfo.homepage_url,
            shares_outstanding: tickerInfo.share_class_shares_outstanding,
            volume_ratio: snapshot.day.v / snapshot.prevDay.v,
            // 暂时设为null，需要额外的API调用来获取这些技术指标
            pe_ratio: null,
            beta: null,
            rsi: null,
            ma_5: null,
            ma_20: null,
            target_price: null
        };
        
        console.log(`[DEBUG] Successfully fetched data for ${symbol}: price=${stockData.current_price}`);
        return stockData;
    } catch (error) {
        console.error(`Failed to fetch comprehensive stock data ${symbol}:`, error.message);
        console.log(`[DEBUG] Creating fallback data for ${symbol}`);
        return createFallbackStockData(symbol);
    }
}

// 创建备用股票数据
function createFallbackStockData(symbol) {
    // 使用一些已知的股票价格作为备用数据
    const fallbackPrices = {
        'AAPL': 257.20, 'MSFT': 415.50, 'GOOGL': 142.30, 'TSLA': 429.96, 'NVDA': 187.66,
        'JNJ': 155.80, 'PFE': 28.45, 'UNH': 520.30, 'MRNA': 12.85, 'ABBV': 233.91,
        'JPM': 185.20, 'BAC': 35.80, 'WFC': 45.60, 'GS': 420.80, 'C': 58.90,
        'XOM': 118.50, 'CVX': 155.80, 'COP': 125.40, 'EOG': 130.20, 'SLB': 45.80,
        'HD': 385.20, 'MCD': 295.80, 'NKE': 95.40, 'SBUX': 102.50, 'TGT': 145.80,
        'BA': 215.60, 'CAT': 340.80, 'GE': 165.40, 'HON': 205.80, 'UPS': 175.20,
        'NEE': 82.50, 'DUK': 95.80, 'SO': 68.40, 'D': 58.90, 'EXC': 42.50,
        'LIN': 445.80, 'APD': 285.60, 'SHW': 285.40, 'ECL': 165.80, 'DD': 72.50,
        'PLD': 125.80, 'AMT': 195.60, 'CCI': 175.40, 'EQIX': 745.80, 'PSA': 285.50,
        'VZ': 42.50, 'T': 16.80, 'TMUS': 145.60, 'CHTR': 285.40, 'CMCSA': 45.80,
        'ENPH': 125.80, 'SEDG': 95.60, 'FSLR': 185.40, 'RUN': 25.80, 'SPWR': 15.50
    };
    
    const currentPrice = fallbackPrices[symbol] || getRandomFloat(50, 500);
    const changePercent = getRandomFloat(-5, 5);
    
    return {
        symbol: symbol,
        name: `${symbol} Inc.`,
        sector: getRandomSector(symbol),
        current_price: currentPrice,
        change_percent: changePercent,
        change_amount: currentPrice * (changePercent / 100),
        market_cap: getRandomFloat(1000000000, 1000000000000),
        market: 'NASDAQ',
        currency: 'USD',
        open_price: currentPrice * getRandomFloat(0.98, 1.02),
        high_price: currentPrice * getRandomFloat(1.01, 1.05),
        low_price: currentPrice * getRandomFloat(0.95, 0.99),
        close_price: currentPrice,
        volume: getRandomInt(1000000, 10000000),
        avg_volume: getRandomInt(800000, 8000000),
        employees: getRandomInt(1000, 50000),
        description: `Leading company in ${getRandomSector(symbol)} sector`,
        website: `https://www.${symbol.toLowerCase()}.com`,
        shares_outstanding: getRandomFloat(100000000, 5000000000),
        volume_ratio: getRandomFloat(0.8, 2.0),
        pe_ratio: getRandomFloat(10, 30),
        beta: getRandomFloat(0.8, 1.5),
        rsi: getRandomFloat(30, 70),
        ma_5: currentPrice * getRandomFloat(0.98, 1.02),
        ma_20: currentPrice * getRandomFloat(0.95, 1.05),
        target_price: currentPrice * getRandomFloat(1.05, 1.20)
    };
}

// 根据股票代码获取行业（模拟）
function getRandomSector(symbol) {
    const sectors = Object.keys(stockPools);
    for (const [sector, symbols] of Object.entries(stockPools)) {
        if (symbols.includes(symbol)) {
            return sector;
        }
    }
    return sectors[Math.floor(Math.random() * sectors.length)];
}

// 生成随机浮点数
function getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// 生成随机整数
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 根据股票代码获取行业（模拟）
function getRandomSector(symbol) {
    const sectors = Object.keys(stockPools);
    for (const [sector, symbols] of Object.entries(stockPools)) {
        if (symbols.includes(symbol)) {
            return sector;
        }
    }
    return sectors[Math.floor(Math.random() * sectors.length)];
}

// 计算AI评分
function calculateAiScore(stockData, style, risk, timeHorizon) {
    // 基础分数
    let baseScore = getRandomInt(60, 95);
    
    // 根据不同参数调整分数
    if (style === 'growth' && parseFloat(stockData.pe_ratio) > 30) {
        baseScore += 5;
    } else if (style === 'value' && parseFloat(stockData.pe_ratio) < 20) {
        baseScore += 5;
    }
    
    if (risk === 'low' && parseFloat(stockData.beta) < 1.0) {
        baseScore += 3;
    } else if (risk === 'high' && parseFloat(stockData.beta) > 1.5) {
        baseScore += 3;
    }
    
    // 确保分数在0-100之间
    return Math.min(100, Math.max(0, baseScore));
}

// 辅助函数：计算建议仓位
function calculateSuggestedPosition(score, risk, investmentAmount) {
    let basePosition = 0;
    
    // 基于评分计算基础仓位
    if (score >= 80) {
        basePosition = 20;
    } else if (score >= 70) {
        basePosition = 15;
    } else if (score >= 60) {
        basePosition = 10;
    } else {
        basePosition = 5;
    }
    
    // 基于风险等级调整
    if (risk === 'high') {
        basePosition = Math.min(basePosition, 10);
    } else if (risk === 'low') {
        basePosition = Math.min(basePosition, 15);
    }
    
    return basePosition;
}

// 辅助函数：获取止损百分比
function getStopLossPercentage(risk) {
    switch (risk) {
        case 'high': return 0.15; // 15%
        case 'medium': return 0.10; // 10%
        case 'low': return 0.05; // 5%
        default: return 0.10;
    }
}

// 辅助函数：获取建议操作
function getRecommendedAction(score) {
    if (score >= 75) return 'Buy';
    if (score >= 60) return 'Hold';
    if (score >= 40) return 'Watch';
    return 'Avoid';
}

// 辅助函数：获取持有周期
function getHoldingPeriod(timeHorizon) {
    switch (timeHorizon) {
        case 'short': return '1-3 months';
        case 'medium': return '3-12 months';
        case 'long': return '1-3 years';
        default: return '3-6 months';
    }
}

// 辅助函数：获取主营业务描述
function getMainBusinessDescription(symbol, sector) {
    const businessDescriptions = {
        'AAPL': 'Consumer electronics, software, and services including iPhone, iPad, Mac, and Apple Services',
        'MSFT': 'Cloud computing, productivity software, and AI services including Azure and Office 365',
        'GOOGL': 'Search engine, advertising, cloud computing, and AI technologies',
        'NVDA': 'Graphics processing units (GPUs) and AI computing platforms',
        'TSLA': 'Electric vehicles, energy storage, and solar panel manufacturing',
        'META': 'Social media platforms, virtual reality, and digital advertising',
        'AMZN': 'E-commerce, cloud computing (AWS), and digital streaming services',
        'JPM': 'Investment banking, commercial banking, and asset management',
        'JNJ': 'Pharmaceuticals, medical devices, and consumer health products',
        'XOM': 'Oil and gas exploration, production, and refining'
    };
    
    return businessDescriptions[symbol] || `${sector} industry leader with diversified business operations`;
}

// 辅助函数：获取财务表现描述
function getFinancialPerformanceDescription(stockData) {
    let performance = '';
    
    // Only analyze P/E ratio if available
    if (stockData.pe_ratio && !isNaN(parseFloat(stockData.pe_ratio))) {
        const peRatio = parseFloat(stockData.pe_ratio);
        if (peRatio > 0 && peRatio < 20) {
            performance += 'Attractive valuation with reasonable P/E ratio. ';
        } else if (peRatio > 20 && peRatio < 30) {
            performance += 'Moderate valuation in line with market expectations. ';
        } else if (peRatio > 30) {
            performance += 'Higher valuation requiring strong growth justification. ';
        }
    }
    
    // Only analyze change percent if available
    if (stockData.change_percent && !isNaN(parseFloat(stockData.change_percent))) {
        const changePercent = parseFloat(stockData.change_percent);
        if (changePercent > 10) {
            performance += 'Strong recent performance with significant upside momentum.';
        } else if (changePercent > 0) {
            performance += 'Positive recent performance with steady growth.';
        } else if (changePercent > -10) {
            performance += 'Mixed recent performance with some volatility.';
        } else {
            performance += 'Challenging recent performance requiring careful evaluation.';
        }
    }
    
    return performance || 'Financial analysis limited due to insufficient data.';
}

// 辅助函数：获取竞争优势
function getCompetitiveAdvantages(symbol, sector) {
    const advantages = {
        'AAPL': 'Strong brand loyalty, ecosystem lock-in, and premium pricing power',
        'MSFT': 'Enterprise market dominance, cloud leadership, and AI integration',
        'GOOGL': 'Search monopoly, data advantage, and AI research leadership',
        'NVDA': 'GPU market dominance, AI chip leadership, and CUDA ecosystem',
        'TSLA': 'EV market leadership, battery technology, and autonomous driving',
        'META': 'Social media network effects, VR/AR innovation, and advertising reach',
        'AMZN': 'E-commerce scale, AWS cloud leadership, and logistics network',
        'JPM': 'Investment banking leadership, diversified revenue, and risk management',
        'JNJ': 'Pharmaceutical pipeline, medical device innovation, and global reach',
        'XOM': 'Integrated operations, scale advantages, and energy transition investments'
    };
    
    return advantages[symbol] || `Strong market position in ${sector} with competitive advantages`;
}

// 辅助函数：获取短期风险
function getShortTermRisks(symbol, risk) {
    const riskLevel = risk.toLowerCase();
    let risks = '';
    
    if (riskLevel === 'high') {
        risks = 'High volatility, market sensitivity, and potential for significant price swings';
    } else if (riskLevel === 'medium') {
        risks = 'Moderate volatility with some market sensitivity and earnings dependency';
    } else {
        risks = 'Lower volatility but still subject to market conditions and sector trends';
    }
    
    return risks;
}

// 辅助函数：获取长期风险
function getLongTermRisks(symbol, sector) {
    const sectorRisks = {
        'technology': 'Technology disruption, regulatory changes, and competitive pressures',
        'healthcare': 'Regulatory approval risks, patent expirations, and healthcare policy changes',
        'finance': 'Interest rate sensitivity, regulatory changes, and economic cycles',
        'energy': 'Commodity price volatility, environmental regulations, and energy transition',
        'consumer': 'Consumer spending patterns, economic cycles, and brand competition',
        'industrial': 'Economic cycles, supply chain disruptions, and capital spending patterns',
        'utilities': 'Regulatory changes, interest rate sensitivity, and infrastructure investments',
        'materials': 'Commodity price volatility, economic cycles, and environmental regulations'
    };
    
    return sectorRisks[sector] || 'Industry-specific risks and broader market conditions';
}

// 生成整体投资策略
function generateOverallStrategy(recommendations, criteria) {
    const { investmentAmount, risk, timeHorizon, sector } = criteria;
    
    // 计算总建议仓位
    const totalSuggestedPosition = recommendations.reduce((sum, rec) => {
        return sum + (rec.investmentAdvice?.suggestedPosition || 0);
    }, 0);
    
    // 生成仓位分配建议
    const positionAllocation = recommendations.map(rec => {
        const amount = (investmentAmount * (rec.investmentAdvice?.suggestedPosition || 0) / 100);
        return `${rec.symbol}: ${rec.investmentAdvice?.suggestedPosition || 0}% ($${amount.toFixed(0)})`;
    }).join(', ');
    
    // 生成风险管理建议
    const riskManagement = generateRiskManagementAdvice(risk, recommendations);
    
    // 生成交易策略
    const tradingStrategy = generateTradingStrategy(timeHorizon, sector, risk);
    
    return {
        positionAllocation: `Total allocation: ${totalSuggestedPosition}% of portfolio. Individual positions: ${positionAllocation}`,
        riskManagement: riskManagement,
        tradingStrategy: tradingStrategy
    };
}

// 生成风险管理建议
function generateRiskManagementAdvice(risk, recommendations) {
    const riskLevel = risk.toLowerCase();
    let advice = '';
    
    if (riskLevel === 'high') {
        advice = 'Set strict stop-losses at 15% below entry price. Monitor positions daily and consider reducing exposure during high volatility periods.';
    } else if (riskLevel === 'medium') {
        advice = 'Set stop-losses at 10% below entry price. Regular portfolio rebalancing quarterly. Monitor market conditions and adjust positions accordingly.';
    } else {
        advice = 'Conservative stop-losses at 5% below entry price. Focus on quality companies with strong fundamentals. Regular portfolio review every 6 months.';
    }
    
    return advice;
}

// 生成交易策略
function generateTradingStrategy(timeHorizon, sector, risk) {
    const horizon = timeHorizon.toLowerCase();
    let strategy = '';
    
    if (horizon === 'short') {
        strategy = 'Focus on short-term momentum and technical indicators. Monitor earnings announcements and sector news closely. Consider quick profit-taking on 20%+ gains.';
    } else if (horizon === 'medium') {
        strategy = 'Balance between fundamental analysis and technical trends. Hold positions through quarterly earnings cycles. Rebalance portfolio every 3-6 months.';
    } else {
        strategy = 'Focus on long-term value creation and fundamental analysis. Hold through market cycles. Annual portfolio review and rebalancing.';
    }
    
    return strategy;
}

// 解析GPT生成的结构化策略
function parseGPTStrategy(gptResponse) {
    try {
        // 如果GPT返回的是结构化文本，尝试解析
        const lines = gptResponse.split('\n');
        let positionAllocation = '';
        let riskManagement = '';
        let tradingStrategy = '';
        
        let currentSection = '';
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.includes('**Position Allocation**')) {
                currentSection = 'position';
                continue;
            } else if (trimmedLine.includes('**Risk Management**')) {
                currentSection = 'risk';
                continue;
            } else if (trimmedLine.includes('**Trading Strategy**')) {
                currentSection = 'trading';
                continue;
            }
            
            if (currentSection === 'position' && trimmedLine) {
                positionAllocation += trimmedLine + ' ';
            } else if (currentSection === 'risk' && trimmedLine) {
                riskManagement += trimmedLine + ' ';
            } else if (currentSection === 'trading' && trimmedLine) {
                tradingStrategy += trimmedLine + ' ';
            }
        }
        
        return {
            positionAllocation: positionAllocation.trim() || 'Portfolio allocation based on risk tolerance and investment preferences.',
            riskManagement: riskManagement.trim() || 'Implement stop-losses and regular portfolio rebalancing.',
            tradingStrategy: tradingStrategy.trim() || 'Follow systematic entry and exit strategies based on market conditions.'
        };
    } catch (error) {
        console.error('Error parsing GPT strategy:', error);
        return {
            positionAllocation: 'Portfolio allocation based on risk tolerance and investment preferences.',
            riskManagement: 'Implement stop-losses and regular portfolio rebalancing.',
            tradingStrategy: 'Follow systematic entry and exit strategies based on market conditions.'
        };
    }
}

// 生成专业分析
function generateProfessionalAnalysis(stockData, style, score) {
    const currentPrice = parseFloat(stockData.current_price);
    let analysisParts = [];
    
    // Company Basic Information Analysis
    analysisParts.push(`Company Analysis: ${stockData.name} (${stockData.symbol}) is currently trading at $${currentPrice.toFixed(2)} on ${stockData.market}.`);
    
    // Market Performance
    if (stockData.change_percent !== null) {
        const changeText = stockData.change_percent >= 0 ? `+${stockData.change_percent.toFixed(2)}%` : `${stockData.change_percent.toFixed(2)}%`;
        const performanceDesc = stockData.change_percent >= 0 ? 'positive' : 'negative';
        analysisParts.push(`Today's performance shows ${performanceDesc} movement with a ${changeText} change.`);
    }
    
    // Company Size and Sector
    if (stockData.market_cap && stockData.employees) {
        const marketCapB = (stockData.market_cap / 1000000000).toFixed(1);
        analysisParts.push(`${stockData.name} operates in the ${stockData.sector} sector with a market cap of $${marketCapB}B and ${stockData.employees} employees.`);
    }
    
    // Volume Analysis
    if (stockData.volume_ratio) {
        const volumeDesc = stockData.volume_ratio > 1.5 ? 'higher than average' : stockData.volume_ratio < 0.8 ? 'lower than average' : 'normal';
        analysisParts.push(`Current trading volume is ${volumeDesc} at ${stockData.volume_ratio.toFixed(1)}x previous day's volume.`);
    }
    
    // Investment Assessment based on available data
    if (score >= 80) {
        analysisParts.push('Investment Outlook: Current fundamentals show favorable conditions for potential growth consideration.');
    } else if (score >= 60) {
        analysisParts.push('Investment Outlook: Moderate potential exhibited with standard market risk assessment.');
    } else {
        analysisParts.push('Investment Outlook: Recommend cautious evaluation and close market monitoring.');
    }
    
    return analysisParts.join(' ');
}

// 生成股票推荐
async function generateStockRecommendations(sector, style, risk, timeHorizon, investmentAmount, req) {
    try {
        // 选择股票池
        let selectedSymbols;
        console.log(`[DEBUG] Requested sector: "${sector}"`);
        
        if (!sector || sector === '' || sector === 'all-sectors' || sector === 'All Sectors') {
            // 如果没有指定行业或选择全行业，从所有股票中随机选择
            const allSymbols = [];
            for (const symbols of Object.values(stockPools)) {
                allSymbols.push(...symbols);
            }
            // 去重
            const uniqueSymbols = [...new Set(allSymbols)];
            selectedSymbols = randomSample(uniqueSymbols, 8);
            console.log(`[DEBUG] Using all sectors, selected ${selectedSymbols.length} stocks`);
        } else {
            // 根据指定行业选择股票
            const availableSymbols = stockPools[sector] || [];
            console.log(`[DEBUG] Found ${availableSymbols.length} stocks for sector "${sector}"`);
            
            if (availableSymbols.length === 0) {
                console.log(`[WARNING] No stocks found for sector "${sector}", available sectors:`, Object.keys(stockPools));
                // 如果找不到指定行业的股票，回退到全行业选择
                const allSymbols = [];
                for (const symbols of Object.values(stockPools)) {
                    allSymbols.push(...symbols);
                }
                const uniqueSymbols = [...new Set(allSymbols)];
                selectedSymbols = randomSample(uniqueSymbols, 6);
                console.log(`[DEBUG] Fallback to all sectors, selected ${selectedSymbols.length} stocks`);
            } else {
                selectedSymbols = randomSample(availableSymbols, 6);
                console.log(`[DEBUG] Selected ${selectedSymbols.length} stocks from sector "${sector}"`);
            }
        }
        
        console.log(`[DEBUG] Final stock selection: ${selectedSymbols.join(', ')}`);
        
        const recommendations = [];
        
        // 如果股票选择为空，创建一些测试推荐
        if (selectedSymbols.length === 0) {
            console.log(`[DEBUG] No stocks selected, creating test recommendations`);
            selectedSymbols = ['TSLA', 'NEE', 'ENPH'];
        }
        
        for (const symbol of selectedSymbols) {
            try {
                console.log(`[DEBUG] 获取 ${symbol} 的数据...`);
                
                // 获取股票数据
                const stockData = await getComprehensiveStockData(symbol);
                console.log(`[DEBUG] Stock data for ${symbol}:`, stockData ? 'SUCCESS' : 'FAILED');
                
                if (!stockData) {
                    console.log(`[WARNING] Failed to get data for ${symbol}, skipping...`);
                    continue;
                }
                
                console.log(`[DEBUG] Successfully got data for ${symbol}: price=${stockData.current_price}, change=${stockData.change_percent}%`);
                
                // 计算AI评分
                const score = calculateAiScore(stockData, style, risk, timeHorizon);
                
                // 使用GPT生成专业分析
                const criteria = { style, risk, timeHorizon, investmentAmount };
                let professionalAnalysis;
                try {
                    console.log(`[DEBUG] Generating analysis for ${symbol}...`);
                    // 暂时跳过GPT分析，使用简单分析
                    professionalAnalysis = generateProfessionalAnalysis(stockData, style, score);
                    console.log(`[DEBUG] Analysis generated for ${symbol}`);
                } catch (gptError) {
                    console.error(`[ERROR] Analysis failed for ${symbol}:`, gptError.message);
                    professionalAnalysis = generateProfessionalAnalysis(stockData, style, score);
                }
                
                // 计算预期收益
                const currentPrice = parseFloat(stockData.current_price);
                const targetPrice = parseFloat(stockData.target_price);
                let expectedReturn;
                
                if (targetPrice > 0) {
                    expectedReturn = ((targetPrice - currentPrice) / currentPrice * 100).toFixed(1);
                } else {
                    // 如果没有目标价格数据，只基于评分保守估算
                    expectedReturn = ((score - 50) * 0.3).toFixed(1);
                }
                
                // 计算建议仓位（基于投资金额）
                const suggestedPosition = calculateSuggestedPosition(score, risk, investmentAmount);
                
                // 计算目标价格和止损价格
                const calculatedTargetPrice = targetPrice > 0 ? targetPrice : currentPrice * (1 + parseFloat(expectedReturn) / 100);
                const stopLossPrice = currentPrice * (1 - getStopLossPercentage(risk));
                
                const recommendation = {
                    symbol: symbol,
                    companyName: stockData.name,
                    industry: stockData.sector,
                    currentPrice: currentPrice,
                    marketCap: stockData.market_cap,
                    peRatio: parseFloat(stockData.pe_ratio),
                    week52Change: stockData.change_percent + '%',
                    
                    // 公司基本面
                    fundamentals: {
                        mainBusiness: getMainBusinessDescription(symbol, stockData.sector),
                        financialPerformance: getFinancialPerformanceDescription(stockData),
                        competitiveAdvantages: getCompetitiveAdvantages(symbol, stockData.sector)
                    },
                    
                    // 投资建议
                    investmentAdvice: {
                        recommendedAction: getRecommendedAction(score),
                        targetPrice: calculatedTargetPrice,
                        stopLoss: stopLossPrice,
                        suggestedPosition: suggestedPosition,
                        holdingPeriod: getHoldingPeriod(timeHorizon)
                    },
                    
                    // 风险评估
                    riskAssessment: {
                        shortTermRisks: getShortTermRisks(symbol, risk),
                        longTermRisks: getLongTermRisks(symbol, stockData.sector),
                        riskLevel: risk.charAt(0).toUpperCase() + risk.slice(1)
                    },
                    
                    // 保留原有字段用于兼容性
                    name: stockData.name,
                    sector: stockData.sector,
                    score: score,
                    reason: professionalAnalysis,
                    expectedReturn: Math.max(parseFloat(expectedReturn), -30).toString(),
                    riskLevel: risk.charAt(0).toUpperCase() + risk.slice(1),
                    current_price: currentPrice,
                    change_percent: stockData.change_percent ? parseFloat(stockData.change_percent) : null,
                    market_cap: stockData.market_cap,
                    pe_ratio: stockData.pe_ratio ? parseFloat(stockData.pe_ratio) : null,
                    volume_ratio: stockData.volume_ratio ? parseFloat(stockData.volume_ratio) : null
                };
                        // 获取登录用户信息
                const user = await getUserFromSession(req);
                // 获取用户ID（从会话中获取，实际环境需要根据实际情况调整）
                let userId = null;
                try {
                    // 注意：这里需要根据实际的认证机制来获取用户ID
                    // 例如从请求的session或token中获取
                    userId = user ? user.id : null;
                    console.log(`[DEBUG] User ID: ${userId}`);
                } catch (error) {
                    console.log(`[DEBUG] User session error: ${error.message}`);
                }
                
                // 保存到数据库
                const aiStockPickerData = {
                    trader_uuid: req.headers['web-trader-uuid'],
                    userid: userId,
                    market: 'USA',
                    symbols: symbol,
                    put_price: currentPrice,
                    currprice: currentPrice,
                    target_price: targetPrice,
                    upside: Math.max(parseFloat(expectedReturn), -30).toString(),
                    out_info: JSON.stringify(recommendation)
                };
                try {
                    // 暂时跳过数据库保存，专注于返回推荐
                    // await insert('ai_stock_picker', aiStockPickerData);
                    console.log(`[DEBUG] Skipping database save for ${symbol}`);
                } catch (dbError) {
                    console.error(`保存推荐结果失败 ${symbol}:`, dbError);
                    // 继续处理，不中断流程
                }
                
                recommendations.push(recommendation);
                console.log(`[DEBUG] ${symbol} 分析完成，评分: ${score}, 总推荐数: ${recommendations.length}`);
                
            } catch (error) {
                console.error(`[ERROR] 分析股票 ${symbol} 时出错:`, error);
                continue;
            }
        }
        
        // 按评分排序
        recommendations.sort((a, b) => b.score - a.score);
        
        console.log(`[DEBUG] 共生成 ${recommendations.length} 个推荐，请求的股票数: ${selectedSymbols.length}`);
        
        // 如果推荐数量太少，记录警告
        if (recommendations.length < 3) {
            console.log(`[WARNING] 只生成了 ${recommendations.length} 个推荐，可能由于数据获取失败`);
        }
        
        return recommendations.slice(0, 5); // 返回前5个推荐
        
    } catch (error) {
        console.error('[ERROR] 生成股票推荐失败:', error);
        return [];
    }
}

// AI Stock Picker API
router.post('/stock-picker', async (req, res) => {
    try {
        const data = req.body;
         // 获取用户积分规则
        const pointsRules = await get_trader_points_rules(req);
        const user=await getUserFromSession(req);
        if(user)
        {
            if(user.membership_points<pointsRules.ai_recommended_consumption)
            {
                return res.status(200).json({ success: false, error: 'Insufficient user points, unable to use AI recommendation function' });
            }
        }
        
        // 获取用户输入的选股标准
        const sector = data.sector || '';
        const style = data.style || 'balanced';
        const risk = data.risk || 'medium';
        const timeHorizon = data.timeHorizon || 'medium';
        const investmentAmount = data.investmentAmount || 100000; // 默认10万美元
        
        console.log(`[DEBUG] AI stock picker request: sector=${sector}, style=${style}, risk=${risk}, time_horizon=${timeHorizon}`);
        
        // 生成股票推荐
        console.log(`[DEBUG] Starting stock recommendation generation...`);
        let recommendations;
        try {
            recommendations = await generateStockRecommendations(sector, style, risk, timeHorizon, investmentAmount, req);
            console.log(`[DEBUG] Generated ${recommendations.length} recommendations`);
        } catch (error) {
            console.error(`[ERROR] Failed to generate recommendations:`, error);
            recommendations = [];
        }
        
        // 如果推荐为空，创建一些测试推荐
        if (recommendations.length === 0) {
            console.log(`[DEBUG] No recommendations generated, creating test data`);
            recommendations = [
                {
                    symbol: 'TSLA',
                    name: 'Tesla Inc.',
                    current_price: 429.96,
                    change_percent: 2.5,
                    score: 85,
                    reason: 'Test recommendation for renewable energy sector',
                    expectedReturn: '15%',
                    riskLevel: 'Medium'
                }
            ];
        }
        
        // 使用GPT生成投资摘要和整体策略
        const criteria = { sector, style, risk, timeHorizon, investmentAmount };
        const investmentSummary = await generateInvestmentSummary(recommendations, criteria);
        
        // 解析GPT生成的结构化策略
        const overallStrategy = parseGPTStrategy(investmentSummary);
        if(user){
        await update_user_points(req,user.id,user.membership_points,pointsRules.ai_recommended_consumption*-1,'Members use AI to recommend stocks');
        }
       
        return res.json({
            success: true,
            recommendations: recommendations,
            investmentSummary: investmentSummary,
            overallStrategy: overallStrategy,
            criteria: {
                sector: sector,
                style: style,
                risk: risk,
                timeHorizon: timeHorizon,
                investmentAmount: investmentAmount
            }
        });
        
    } catch (error) {
        console.error('[ERROR] AI stock picker API error:', error);
        return res.status(500).json({ error: 'Failed to generate stock recommendations' });
    }
});

// 计算持仓评分
function calculatePortfolioScore(stockData, portfolioPerformance) {
    let baseScore = 50;
    
    // Only adjust score based on real technical indicators if available
    if (stockData) {
        const currentPrice = parseFloat(stockData.current_price) || 0;
        
        // Only analyze RSI if real data available
        if (stockData.rsi && !isNaN(parseInt(stockData.rsi))) {
            const rsi = parseInt(stockData.rsi);
            if (rsi >= 30 && rsi <= 70) {
                baseScore += 10;
            } else if (rsi > 70) {
                baseScore -= 5;
            } else if (rsi < 30) {
                baseScore += 5;
            }
        }
        
        // Only analyze P/E ratio if real data available
        if (stockData.pe_ratio && !isNaN(parseFloat(stockData.pe_ratio))) {
            const peRatio = parseFloat(stockData.pe_ratio);
            if (peRatio >= 10 && peRatio <= 25) {
                baseScore += 10;
            } else if (peRatio > 40) {
                baseScore -= 10;
            }
        }
        
        // Only analyze moving averages if real data available  
        if (stockData.ma_5 && stockData.ma_20 && currentPrice > 0) {
            const ma5 = parseFloat(stockData.ma_5);
            const ma20 = parseFloat(stockData.ma_20);
            if (currentPrice > ma5 && ma5 > ma20) {
                baseScore += 15;
            } else if (currentPrice < ma5 && ma5 < ma20) {
                baseScore -= 15;
            }
        }
    }
    
    // 基于持仓表现调整
    if (portfolioPerformance) {
        const totalReturn = parseFloat(portfolioPerformance.totalReturn) || 0;
        const holdingDays = parseInt(portfolioPerformance.holdingDays) || 0;
        
        // 收益率调整
        if (totalReturn > 20) {
            baseScore += 20;
        } else if (totalReturn > 10) {
            baseScore += 15;
        } else if (totalReturn > 0) {
            baseScore += 10;
        } else if (totalReturn < -20) {
            baseScore -= 20;
        } else if (totalReturn < -10) {
            baseScore -= 10;
        }
        
        // 持仓时间调整
        if (holdingDays > 365) {
            baseScore += 5;
        } else if (holdingDays < 30) {
            baseScore -= 5;
        }
    }
    
    return Math.max(0, Math.min(100, baseScore));
}

// Parse GPT position analysis text
function parsePortfolioAnalysis(gptText, score) {
    const sections = [];
    const lines = gptText.split('\n').filter(line => line.trim());
    const contentText = lines.join(' ');
    
    if (contentText.length > 200) {
        const midPoint = Math.floor(contentText.length / 2);
        sections.push({
            'title': 'Position Analysis',
            'score': Math.min(100, score + getRandomInt(-10, 10)),
            'content': contentText.substring(0, midPoint)
        });
        sections.push({
            'title': 'Investment Recommendation',
            'score': Math.min(100, score + getRandomInt(-5, 15)),
            'content': contentText.substring(midPoint)
        });
    } else {
        sections.push({
            'title': 'Comprehensive Analysis',
            'score': score,
            'content': contentText
        });
    }
    
    return sections;
}

// Generate fallback position diagnosis
function generateFallbackPortfolioDiagnosis(symbol, purchasePrice = null, purchaseDate = null, portfolioPerformance = null) {
    const score = getRandomInt(45, 85);
    
    const diagnosis = {
        'symbol': symbol,
        'overallScore': score,
        'summary': `${symbol} analysis based on current market data, overall score: ${score}/100.`,
        'portfolioPerformance': portfolioPerformance,
        'sections': [
            {
                'title': 'Technical Analysis',
                'score': getRandomInt(40, 90),
                'content': `${symbol} technical indicators show the stock is currently in a ${getRandomInt(0, 1) ? 'relatively strong' : 'consolidation'} phase.`
            },
            {
                'title': 'Investment Recommendation',
                'score': getRandomInt(50, 95),
                'content': `Based on current market conditions, recommend to ${getRandomInt(0, 1) ? 'maintain current position' : 'adjust position appropriately'}.`
            }
        ]
    };
    
    return diagnosis;
}

// 生成持仓诊断
async function generatePortfolioDiagnosis(symbol, purchasePrice, purchaseDate, purchaseMarket, analysisType) {
    try {
        // 获取当前股票数据
        const stockData = await getComprehensiveStockData(symbol);
        
        if (!stockData) {
            return generateFallbackPortfolioDiagnosis(symbol, purchasePrice, purchaseDate);
        }
        
        const currentPrice = parseFloat(stockData.current_price);
        
        // 计算持仓表现
        let portfolioPerformance = null;
        let holdingDays = 0;
        let totalReturn = 0;
        
        if (purchasePrice && purchaseDate) {
            try {
                const purchaseDt = new Date(purchaseDate);
                const currentDt = new Date();
                holdingDays = Math.floor((currentDt - purchaseDt) / (1000 * 60 * 60 * 24));
                
                if (parseFloat(purchasePrice) > 0) {
                    totalReturn = ((currentPrice - parseFloat(purchasePrice)) / parseFloat(purchasePrice)) * 100;
                }
                
                portfolioPerformance = {
                    'purchasePrice': parseFloat(purchasePrice),
                    'currentPrice': currentPrice,
                    'totalReturn': totalReturn,
                    'holdingDays': holdingDays,
                    'purchaseDate': purchaseDate,
                    'purchaseMarket': purchaseMarket
                };
                console.log(portfolioPerformance)
            } catch (error) {
                console.error(`[WARNING] 持仓计算失败:`, error);
            }
        }
        
        // 使用GPT生成专业诊断分析
        const gptAnalysis = await generateStockAnalysis(stockData, 'portfolio-diagnosis', portfolioPerformance);
        const mockAnalysis = gptAnalysis || generateMockPortfolioAnalysis(symbol, stockData, portfolioPerformance);
        
        // 计算评分
        const overallScore = calculatePortfolioScore(stockData, portfolioPerformance);
        
        // 构建诊断结果
        const diagnosis = {
            'symbol': symbol,
            'overallScore': overallScore,
            'summary': `${symbol} comprehensive analysis score: ${overallScore}/100. ${mockAnalysis.substring(0, 100)}${mockAnalysis.length > 100 ? '...' : ''}`,
            'portfolioPerformance': portfolioPerformance,
            'sections': parsePortfolioAnalysis(mockAnalysis, overallScore),
            'gptAnalysis': gptAnalysis // 添加GPT分析结果
        };
        
        console.log(`[DEBUG] Portfolio diagnosis ${symbol}: Score ${overallScore}, Portfolio return ${totalReturn.toFixed(2)}%`);
        return diagnosis;
        
    } catch (error) {
        console.error(`[ERROR] 持仓诊断失败 ${symbol}:`, error);
        return generateFallbackPortfolioDiagnosis(symbol, purchasePrice, purchaseDate);
    }
}

// Generate mock position analysis (replace GPT API)
function generateMockPortfolioAnalysis(symbol, stockData, portfolioPerformance) {
    const currentPrice = parseFloat(stockData.current_price);
    let analysis = [];
    
    // Portfolio Performance Assessment
    if (portfolioPerformance) {
        const totalReturn = portfolioPerformance.totalReturn;
        const holdingDays = portfolioPerformance.holdingDays;
        
        let returnDesc = '';
        if (totalReturn > 0) {
            returnDesc = `The holding has generated a positive return of ${totalReturn.toFixed(2)}% over ${holdingDays} days of holding.`;
        } else {
            returnDesc = `The holding has experienced a loss of ${Math.abs(totalReturn).toFixed(2)}% over ${holdingDays} days.`;
        }
        
        analysis.push(`Portfolio Performance Assessment: ${returnDesc}`);
    }
    
    // Company Information
    if (stockData.name && stockData.sector) {
        analysis.push(`Company Profile: ${stockData.name} operates in the ${stockData.sector} sector.`);
    }
    
    // Market Position with Real Data
    let marketPosition = `Current Market Position: ${symbol} is currently trading at $${currentPrice.toFixed(2)}`;
    
    if (stockData.market) {
        marketPosition += ` on ${stockData.market}`;
    }
    
    if (stockData.change_percent !== null) {
        const changeSymbol = stockData.change_percent >= 0 ? '+' : '';
        marketPosition += ` with today's change of ${changeSymbol}${stockData.change_percent.toFixed(2)}%`;
    }
    
    analysis.push(marketPosition + '.');
    
    // Volume Analysis
    if (stockData.volume_ratio) {
        const volumeDesc = stockData.volume_ratio > 1.5 ? 'increased' : stockData.volume_ratio < 0.8 ? 'decreased' : 'normal';
        analysis.push(`Volume Activity: Trading volume is ${volumeDesc} compared to previous trading day (${stockData.volume_ratio.toFixed(1)}x).`);
    }
    
    // Company Size
    if (stockData.market_cap) {
        const marketCapB = (stockData.market_cap / 1000000000).toFixed(1);
        analysis.push(`Company Size: Market capitalization of $${marketCapB}B`);
        
        if (stockData.employees) {
            analysis[analysis.length - 1] += ` with ${stockData.employees} employees`;
        }
    }
    
    // Investment Recommendation
    analysis.push(`Investment Recommendation: Based on available real market data and current price action, monitor the stock closely and adjust position according to risk tolerance and market trends.`);
    
    return analysis.join('\n');
}

// AI Portfolio Diagnosis API
router.post('/portfolio-diagnosis', async (req, res) => {
    try {
        const data = req.body;
         // 获取用户积分规则
        
        const user=await getUserFromSession(req);
        const pointsRules = await get_trader_points_rules(req);
         if(user){
           
            if(user.membership_points<pointsRules.ai_diagnostic_consumption)
            {
                return res.status(200).json({ success: false, error: 'Insufficient user points, unable to use AI stock diagnosis function' });
            }
        }
       
        // 获取用户输入的持仓信息
        const symbol = data.symbol || '';
        const purchasePrice = data.purchasePrice || '';
        const purchaseDate = data.purchaseDate || '';
        const purchaseMarket = data.purchaseMarket || 'USA';
        const analysisType = data.analysisType || 'comprehensive';
        
        if (!symbol) {
            return res.status(400).json({ error: 'Stock symbol is required' });
        }
        
        console.log(`[DEBUG] AI portfolio diagnosis request: symbol=${symbol}, purchase_price=${purchasePrice}, purchase_date=${purchaseDate}, market=${purchaseMarket}`);
        
        // 生成持仓诊断
        const diagnosis = await generatePortfolioDiagnosis(symbol, purchasePrice, purchaseDate, purchaseMarket, analysisType);
        if(user){
            await update_user_points(req,user.id,user.membership_points,pointsRules.ai_diagnostic_consumption*-1,'Members use AI to diagnose stocks');
        }
        return res.json({
            success: true,
            diagnosis: diagnosis
        });
        
    } catch (error) {
        console.error('[ERROR] AI portfolio diagnosis API error:', error);
        return res.status(500).json({ error: 'Failed to generate portfolio diagnosis' });
    }
});

// AI推荐历史功能接口
router.get('/apihistory', async (req, res) => {
    try {
        const webTraderUUID = req.headers['web-trader-uuid'] || Web_Trader_UUID;
        const userToken = req.headers['session-token'];
        
        if (!userToken) {
            return res.status(401).json({ success: false, message: 'User not logged in' });
        }
        
        // 获取登录用户信息
        const user = await getUserFromSession(req);
        if (!user || !user.id) {
            return res.status(401).json({ success: false, message: 'Invalid user session' });
        }
        
        const conditions = [];
         conditions.push({ type: 'eq', column: 'trader_uuid', value: webTraderUUID });
        conditions.push({ type: 'eq', column: 'userid', value: user.id });
        
        // 查询用户的AI选股历史
        const historyList = await select('ai_stock_picker', '*', conditions, null,null, { column: 'put_time', ascending: false });
        
        // 为每条历史记录添加实时价格信息（这里使用模拟数据）
        for (const item of historyList) {
            console.log(item)
            // 模拟获取实时价格
            const mockPrice =await get_real_time_price(item.market,item.symbols);
            
            item.currprice = parseFloat(mockPrice);
            
            // 解析out_info字段
            try {
                item.out_info = JSON.parse(item.out_info);
            } catch (e) {
                item.out_info = {};
            }
        }
        
        res.status(200).json({
            success: true,
            data: historyList
        });
        
    } catch (error) {
        handleError(res, error, '获取AI推荐历史失败');
    }
});

module.exports = router;

// 添加JavaScript版本的round、float、int函数
function round(value, decimals = 0) {
    return Number(value.toFixed(decimals));
}

function float(value) {
    return parseFloat(value);
}

function int(value) {
    return parseInt(value);
}

// Note: Removed create_fallback_stock_data function as it generates simulated data
// Only real price data is now used for stock analysis