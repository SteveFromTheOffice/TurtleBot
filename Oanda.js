//const Crypto       = require("crypto");
const EventEmitter = require("./EventEmitter.js");
const QueryString  = require("querystring");
const SuperAgent   = require("superagent");

module.exports = class Oanda extends EventEmitter {

    constructor(token, accountId) {
        super();
        
        this.accountId = accountId;
        this.baseURL   = "https://api-fxtrade.oanda.com";
        this.token     = token;
        
        this.getAccount()
            .then(response => {
                this.account = response;
                this.emit("ready");
            });
        
    }
    
    cancelOrder(orderId) {

        return this._authRequest("PUT", `/v3/accounts/${this.accountId}/orders/${orderId}/cancel`, undefined, undefined)
            .then(response => {
                return response;
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
            
    }
    
    cancelPendingOrders() {
        
        this.getPendingOrders().then(orders => {
            
            orders.forEach(order => {
                
                this.cancelOrder(order.id);
                
            });
            
        });
    }
    
    getAccount() {

        return this._authRequest("GET", `/v3/accounts/${this.accountId}`, undefined, undefined)
            .then(response => {
                return response.account;
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
        
    }
    
    getCandles(instrument, interval, count=100) {
        
        let query = {
            //price             : undefined,
            granularity       : interval,
            count             : count,
            //from              : undefined,
            //to                : undefined,
            //smooth            : undefined,
            //includeFirst      : undefined,
            //dailyAlignment    : undefined,
            //alignmentTimezone : undefined,
            //weeklyAlignment   : undefined,
            //units             : undefined
        }

        return this._authRequest("GET", `/v3/accounts/${this.accountId}/instruments/${instrument}/candles`, query, undefined)
            .then(response => {
                return response.candles.map(c => {
                    return { 
                        open   : Number(c.mid.o),
                        high   : Number(c.mid.h),
                        low    : Number(c.mid.l),
                        close  : Number(c.mid.c),
                        time   : new Date(c.time).getTime(),
                        volume : c.volume
                    };
                });
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
            
    }
    
    getCandlesLatest(instrument, interval) {
        
        let query = {
            candleSpecifications : `${instrument}:${interval}:M`,
            //units                : undefined,
            //smooth               : false,
            //dailyAlignment       : 17,
            //alignmentTimezone    : "America/New_York",
            //weeklyAlignment      : "Friday"
        }

        return this._authRequest("GET", `/v3/accounts/${this.accountId}/candles/latest`, query, undefined)
            .then(response => {
                return response.latestCandles[0].candles.map(c => {
                    return {
                        symbol : response.latestCandles[0].instrument,
                        open   : Number(c.mid.o),
                        high   : Number(c.mid.h),
                        low    : Number(c.mid.l),
                        close  : Number(c.mid.c),
                        time   : new Date(c.time).getTime(),
                        volume : c.volume
                    };
                });
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
            
    }
    
    getPendingOrders() {

        return this._authRequest("GET", `/v3/accounts/${this.accountId}/pendingOrders`, undefined, undefined)
            .then(response => {
                return response.orders;
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
            
    }
    
    stopOrder(instrument, quantity, entryPrice, profitPrice, stopPrice) {
        
        let body = {
            order: {
                type                     : "STOP",
                instrument               : instrument,
                units                    : (Math.floor(quantity*10)/10).toString(),
                price                    : entryPrice.toString(),
                //priceBound               : undefined,
                //timeInForce              : undefined,
                //gtdTime                  : undefined,
                //positionFill             : undefined,
                triggerCondition         : "MID",
                //clientExtensions         : undefined,
                //takeProfitOnFill         : undefined,
                //stopLossOnFill           : {
                //    price            : Math.floor(stopPrice*10)/10,
                    //distance         : (DecimalNumber),
                    //timeInForce      : (TimeInForce, default=GTC),
                    //gtdTime          : (DateTime),
                    //clientExtensions : (ClientExtensions),
                    //guaranteed       : (boolean, deprecated)
                //},
                //guaranteedStopLossOnFill : undefined,
                //trailingStopLossOnFill   : undefined,
                //tradeClientExtensions    : undefined
            }
        }

        return this._authRequest("POST", `/v3/accounts/${this.accountId}/orders`, undefined, body)
            .then(response => {
                return response;
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
            
    }

    subscribeCandle(instrument, interval) {
        
        let latest = undefined;
        
        setInterval(async () => {
        
            let candles = await this.getCandlesLatest(instrument, interval);
            
            if( latest && candles[1].time == latest.time )
                return;
                
            latest = candles[1];
            this.emit("candle", latest);
        
        }, 5000);
        
    }

    _authRequest(method, path, query = {}, body) {
        
        query     = QueryString.encode(query);

        return SuperAgent(method, `${this.baseURL}${path}?${query}`)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${this.token}`)
            .send(body ? JSON.stringify(body) : "")
            .then(result => {
                return result.body; 
            })
            .catch(result => {
                console.warn(result.response.text);
                return result.response.text; 
            });
            
    }
    
}