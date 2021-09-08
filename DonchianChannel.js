const EventEmitter = require("./EventEmitter.js");

module.exports = class DonchianChannel extends EventEmitter {

    constructor(amplitude=20) {
        super();
    
        this.candles   = [];
        this.amplitude = amplitude;

    }

    update(candle) {
        
        this.candles.push(candle);
        
        if( this.candles.length < this.amplitude )
            return;
            
        if( this.candles.length > this.amplitude )
            this.candles.shift();
        
        this.high = Math.max.apply(Math, this.candles.map(o => o.high));
        this.low  = Math.min.apply(Math, this.candles.map(o => o.low));
        
        this.emit("update", {high: this.high, low: this.low});
        
    }
    
}