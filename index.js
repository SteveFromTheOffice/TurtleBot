const Turtle      = require("./Turtle.js");
const Binance     = require("./BinanceFutures.js");
const settings    = require("./config.json");
const { Webhook } = require("discord-webhook-node");

let BALANCE = settings.balance;

let binance = new Binance(settings.key, settings.secret);
    binance.on('balance', (balance) => {
        
        if( balance.asset != "USDT" )
            return;
            
        BALANCE = balance.balance;
        
        if(settings.webhook != "")
            webhook.send(`Balance : $${Math.floor(balance.balance*100)/100} (${ Math.floor((balance.balance/settings.balance-1)*10000)/100}%)`);
            
    });
    binance.on('candle', async (candle) => {
            
        let turtle  = new Turtle(settings.topLength, settings.botLength);
        let candles = await binance.getCandles(candle.symbol, settings.timeframe, Math.max(settings.topLength, settings.botLength)*2+1);
            
        // Update indicator.
        candles.forEach(candle => {
            turtle.update(candle);
        });
            
        // Cancel open orders.
        binance.cancelOpenOrders(candle.symbol);
            
        let position = binance.account.positions.find(o => o.symbol == candle.symbol && Number(o.positionAmt) != 0);
        let qty      = BALANCE*settings.risk / (turtle.longEntry - turtle.longStop);
        
        // We have a long position, update the SL.
        if( position && position.positionAmt > 0 ) {
            binance.stopOrder(candle.symbol, "LONG", "SELL", position.positionAmt, turtle.longStop);
        }
        
        // We have a short position, update the SL.
        if( position && position.positionAmt < 0 ) {
            binance.stopOrder(candle.symbol, "SHORT", "BUY", position.positionAmt, turtle.shortStop);
        }
        
        // We don't have a position, create new long entry.
        if( !position && turtle.token == -1 ) {
            binance.stopOrder(candle.symbol, "LONG", "BUY", qty, turtle.longEntry);
        }
        
        // We don't have a position, create new short entry.
        if( !position && turtle.token == 1 ) {
            binance.stopOrder(candle.symbol, "SHORT", "SELL", qty, turtle.shortEntry);
        }
         
    });
    binance.on('ready', async () => {
       
       settings.pairs.forEach(symbol => {
           binance.subscribeCandle(symbol, settings.timeframe);
       });
        
    });
    
let webhook = new Webhook(settings.webhook);