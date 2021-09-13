const EventEmitter    = require("./EventEmitter.js");
const DonchianChannel = require("./DonchianChannel.js");

module.exports = class Turtle extends EventEmitter {

    constructor(slowLength=20, fastLength=10) {
        super();
        
        this.slow   = new DonchianChannel(slowLength);
        this.fast   = new DonchianChannel(fastLength);
        this.token = 0;

    }

    update(candle) {
        
        if( this.token == 0 ) {
        
            if( candle.high >= this.slow.high )
                this.token = 1;
            
            if( candle.low <= this.slow.low )
                this.token = -1;
            
        }
        
        else if( this.token == -1 && candle.high > this.fast.high )
            this.token = 0;
            
        else if( this.token == 1 && candle.low < this.fast.low )
            this.token = 0;
            
        this.slow.update(candle);
        this.fast.update(candle);
        
        this.longEntry = this.slow.high;
        this.longStop  = this.fast.low;
        
        this.shortEntry = this.slow.low;
        this.shortStop  = this.fast.high;
        
    }
    
}