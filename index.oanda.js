const Turtle      = require("./Turtle.js");
const Oanda       = require("./Oanda.js");
const settings    = require("./config.json").oanda;

let oanda = new Oanda(settings.token, settings.account);
    oanda.on('candle', async (candle) => {
        
        let turtle  = new Turtle(settings.slowLength, settings.fastLength);
        let candles = await oanda.getCandles(candle.symbol, settings.interval, Math.max(settings.slowLength, settings.fastLength)*2+1);
            
        // Remove incomplete candle.
        candles.pop();
        
        // Remove previous candle.
        candles.pop();
        
        // Update indicator.
        candles.forEach(candle => {
            turtle.update(candle);
        });
            
        // Cancel open orders.
        oanda.cancelPendingOrders();
            
        let account  = await oanda.getAccount();
        let balance  = Number(account.NAV);
        let position = account.positions.find(o => o.instrument == candle.symbol);
        
        let longQty  = Math.min(Math.floor(balance/150)*0.1, balance*settings.risk / (turtle.longEntry - turtle.longStop) / 1.29);
        let shortQty = Math.max(-Math.floor(balance/150)*0.1, balance*settings.risk / (turtle.shortEntry - turtle.shortStop) / 1.29);
        
        // We have a long position, update the SL.
        if( position && position.long.units != "0.0" ) {
            console.log(candle.symbol, "LONG", "SELL", -Number.parseFloat(position.long.units), turtle.longStop);
            oanda.stopOrder(candle.symbol, -Number.parseFloat(position.long.units), turtle.longStop);
        }
        
        // We have a short position, update the SL.
        if( position && position.short.units != "0.0" ) {
            console.log(candle.symbol, "SHORT", "BUY", -Number.parseFloat(position.short.units), turtle.shortStop);
            oanda.stopOrder(candle.symbol, -Number.parseFloat(position.short.units), turtle.shortStop);
        }
        
        // We don't have a position, create new long entry.
        if( true && position && position.long.units == "0.0" ) {
            console.log(candle.symbol, "LONG", "BUY", longQty, turtle.longEntry);
            oanda.stopOrder(candle.symbol, longQty, turtle.longEntry);
        }
        
        // We don't have a position, create new short entry.
        if( true && position && position.short.units == "0.0" ) {
            console.log(candle.symbol, "SHORT", "SELL", shortQty, turtle.shortEntry);
            oanda.stopOrder(candle.symbol, shortQty, turtle.shortEntry);
        }
         
    });
    oanda.on('ready', async () => {
       
        settings.instruments.forEach(instrument => {
            oanda.subscribeCandle(instrument, settings.interval);
        });
        
    });