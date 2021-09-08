const EventEmitter    = require("./EventEmitter.js");
const DonchianChannel = require("./DonchianChannel.js");

module.exports = class Turtle extends EventEmitter {

    constructor(topLength=20, botLength=10) {
        super();
        
        this.top   = new DonchianChannel(topLength);
        this.bot   = new DonchianChannel(botLength);
        this.token = 0;

    }

    update(candle) {
        
        if( candle.high >= this.top.high )
            this.token = 1;
            
        if( candle.low <= this.bot.low )
            this.token = -1;
            
        this.top.update(candle);
        this.bot.update(candle);
        
        this.longEntry = this.top.high;
        this.longStop  = this.bot.low;
        
        this.shortEntry = this.top.low;
        this.shortStop  = this.bot.high;
        
    }
    
}