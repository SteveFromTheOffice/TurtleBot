const Crypto       = require("crypto");
const EventEmitter = require("./EventEmitter.js");
const QueryString  = require("querystring");
const SuperAgent   = require("superagent");
const WebSocket    = require("ws");

module.exports = class Binance extends EventEmitter {

    constructor(key, secret) {
        super();

        this.account   = {};
        this.balances  = {};
        this.baseURL   = "https://fapi.binance.com";
        this.deltaTime = 0;
        this.info      = undefined;
        this.isReady   = false;
        this.key       = key;
        this.nonce     = 0;
        this.positions = {};
        this.secret    = secret;
        this.socket    = undefined;
        
        this._connect();
        this.requestQueue = 0;
        
    }
    
    bracketOrder(symbol, qty, entryPrice, stopPrice, profitPrice, cancelPrice, breakPrice) {
        
        let position = entryPrice > stopPrice ? "LONG" : "SHORT";
        let side     = entryPrice > stopPrice ? "BUY"  : "SELL";
        let side_1   = entryPrice > stopPrice ? "SELL" : "BUY";
        
        return this.limitOrder(symbol, position, side, qty, entryPrice).then(entryOrder => {
                
            let cancelHandler = async (candle) => {
                
                if( candle.symbol != symbol)
                    return;
                
                if( candle.high > cancelPrice && candle.low < cancelPrice ) 
                    this.cancelOrder(symbol, entryOrder.orderId).then(c => { 
                        this.off('candle', cancelHandler);
                        this.off('order', fillHandler);
                    });
                
            }
            let fillHandler   = async (entryEvent) => {
                
                if( entryEvent.X != "FILLED")
                    return;
                
                if( entryEvent.i != entryOrder.orderId )
                    return;
                    
                // OCO orders.
                let stopOrder   = stopPrice   && await this.stopOrder(symbol, position, side_1, entryOrder.origQty, stopPrice);
                let profitOrder = profitPrice && await this.profitOrder(symbol, position, side_1, entryOrder.origQty, profitPrice);
                        
                // OCO order filled.
                this.on('order', ocoEvent => {
                    
                    if( ocoEvent.X != "FILLED")
                        return;
            
                    if( (stopOrder && ocoEvent.i == stopOrder.orderId) || (profitOrder && ocoEvent.i == profitOrder.orderId) ) {
                        stopOrder   && this.cancelOrder(symbol, stopOrder.orderId);
                        profitOrder && this.cancelOrder(symbol, profitOrder.orderId);
                        this.off('candle', cancelHandler);
                        this.off('order', fillHandler);
                    }
                    
                });
            };
            
            cancelPrice && this.on('candle', cancelHandler);
            this.on('order', fillHandler);
            
            return entryOrder;
            
        });
        
    }

    cancelOrder(symbol, orderId) {

        let query = {
            symbol    : symbol,
            orderId   : orderId
        }
        
        console.log(`[${symbol}] Cancelling order ( ID : ${orderId} )`);

        return this._authRequest("DELETE", `/fapi/v1/order`, query, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });

    }
    
    cancelOpenOrders(symbol) {
        
        let query = {
            symbol    : symbol
        }
        
       // console.log(`[${symbol}] Cancelling open orders.`);

        return this._authRequest("DELETE", `/fapi/v1/allOpenOrders`, query, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });
            
    }
    
    depositAddress(asset) {

        let query = {
            asset : asset
        }

        return this._authRequest("GET", "/wapi/v3/depositAddress.html", query, undefined)
            .then(response => {
                console.log(response);
                return response;
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
        
    }

    getAccount() {

        return this._authRequest("GET", "/fapi/v2/account", undefined, undefined)
            .then(response => {
                return response;
            })
            .catch(error => {
                console.warn(error);
                return error;
            });

    }
    
    getCandles(symbol, interval, limit=250, endTime=Date.now()) {

        let query = {
            symbol   : symbol,
            interval : interval,
            limit    : limit,
            endTime  : endTime
        };

        return this._request("GET", "/fapi/v1/klines", query, undefined)
            .then(response => {
                
                return response.map(o => { 
                    return { symbol: symbol, open: Number(o[1]), high: Number(o[2]), low: Number(o[3]), close: Number(o[4]), volume: Number(o[5]), time: Number(o[0]) };
                });
                
            })
            .catch(error => {
                console.warn(error);
                return error;
            });
    }
    
    getExchangeInfo() {

        return this._request("GET", "/fapi/v1/exchangeInfo", undefined, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });

    }

    getListenKey() {

        return SuperAgent(`POST`, `${this.baseURL}/fapi/v1/listenKey`)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set('X-MBX-APIKEY', this.key)
            .send("")
            .then(result => { 
                return result.body.listenKey; 
                
            })
            .catch(result => { 
                console.log(result.response.error); 
                return result.response.error; 
            });

    }
    
    getSymbol(symbol) {
        
        return this.info.symbols.find(o => o.symbol == symbol);
        
    }

    getTime() {

        return this._request("GET", "/fapi/v1/time", undefined, undefined)
            .then(response => {
                this.deltaTime = Date.now() - response.serverTime;
                return response;
            });

    }

    limitOrder(symbol, positionSide, side, quantity, price) {

        let pricePrecision = Number(this.getSymbol(symbol).filters.find(o => o.filterType == "PRICE_FILTER").tickSize);
        let quantPrecision = Number(this.getSymbol(symbol).filters.find(o => o.filterType == "LOT_SIZE").stepSize);
        
            quantity  = Number( (Math.floor(quantity / quantPrecision) / (1 / quantPrecision)).toFixed(8) );
            price     = Number( (Math.floor(price / pricePrecision ) / (1 / pricePrecision)).toFixed(8) );
            
        let query = {
            symbol      : symbol,
            side        : side,
            timeInForce : "GTX",
            type        : "LIMIT",
            quantity    : Math.abs(quantity),
            positionSide : positionSide,
            price       : price
        }
        
        console.log(`[${symbol}] LIMIT ORDER -- ${positionSide} ${side} : ${quantity} contracts @ ${price} USDT`);

        return this._authRequest("POST", "/fapi/v1/order", query, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });

    }

    marketOrder(symbol, positionSide, side, quantity) {

        let quantPrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "LOT_SIZE").stepSize);
        
            quantity  = Number( (Math.floor(quantity / quantPrecision) / (1 / quantPrecision)).toFixed(8) );
            
        let query = {
            symbol       : symbol,
            side         : side,
            type         : "MARKET",
            positionSide : positionSide,
            quantity     : Math.abs(quantity)
        }
        
        console.log(`[${symbol}] MARKET ORDER -- ${positionSide} ${side} : ${quantity} contracts`);

        return this._authRequest("POST", "/fapi/v1/order", query, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });

    }
    
    profitOrder(symbol, positionSide, side, quantity, price) {

        let pricePrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "PRICE_FILTER").tickSize);
        let quantPrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "LOT_SIZE").stepSize);
        
            quantity  = Number( (Math.floor(quantity / quantPrecision) / (1 / quantPrecision)).toFixed(8) );
            price     = Number( (Math.floor(price / pricePrecision ) / (1 / pricePrecision)).toFixed(8) );
            
        let query = {
            symbol       : symbol,
            side         : side,
            type         : "LIMIT",
            timeInForce  : "GTC",
            quantity     : Math.abs(quantity),
            positionSide : positionSide,
            price        : price,
        }
        
        console.log(`[${symbol}] PROFIT ORDER -- ${positionSide} ${side} : ${quantity} contracts @ ${price} USDT`);

        return this._authRequest("POST", "/fapi/v1/order", query, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });

    }

    stopOrder(symbol, positionSide, side, quantity, price) {

        let pricePrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "PRICE_FILTER").tickSize);
        let quantPrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "LOT_SIZE").stepSize);
        
            quantity  = Number( (Math.floor(quantity / quantPrecision) / (1 / quantPrecision)).toFixed(8) );
            price     = Number( (Math.floor(price / pricePrecision ) / (1 / pricePrecision)).toFixed(8) );
            
        
        let query = {
            symbol        : symbol,
            side          : side,
            type          : "STOP_MARKET",
            positionSide  : positionSide,
            //price       : 0,
            quantity      : Math.abs(quantity),
            stopPrice     : price,
            //closePosition : true
        }
        
        //console.log(`[${symbol}] STOP ORDER -- ${positionSide} ${side} : ${quantity} contracts @ ${price} USDT`);

        return this._authRequest("POST", "/fapi/v1/order", query, undefined)
            .catch(error => {
                console.warn(error);
                return error;
            });

    }

    stopTrailOrder(symbol, positionSide, side, quantity, price, distance) {

        let pricePrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "PRICE_FILTER").tickSize);
        let quantPrecision = Number(this.getSymbol(symbol).filters.find(o=>o.filterType == "LOT_SIZE").stepSize);
        
            quantity  = Number( (Math.floor(quantity / quantPrecision) / (1 / quantPrecision)).toFixed(8) );
            price     = Number( (Math.floor(price / pricePrecision ) / (1 / pricePrecision)).toFixed(8) );
            
        
        let query = {
            symbol          : symbol,
            side            : side,
            type            : "TRAILING_STOP_MARKET",
            positionSide    : positionSide,
            //price       : 0,
            quantity        : Math.abs(quantity),
            //stopPrice     : price,
            activationPrice : price,
            callbackRate    : distance,
            closePosition   : true
        }
        
        console.log(`[${symbol}] TRAIL ORDER -- ${positionSide} ${side} : ${quantity} contracts @ ${price} USDT`);

        return this._authRequest("POST", "/fapi/v1/order", query, undefined)
            .catch(error => {
                return error;
                console.warn(error);
            });

    }

    subscribe(streams) {
        
        let data = {
            method : "SUBSCRIBE",
            params : Array.isArray(streams) ? streams : [streams],
            id     : this.nonce++
        };
        
        this.socket.send(JSON.stringify(data));

    }
    
    subscribeCandle(symbol, interval) {
        
        this.getCandles(symbol, interval, 2).then(candles => {
            
                    
            if( this.positions[symbol] ) {
                this.positions[symbol].unrealized = (candles[0].close - this.positions[symbol].entry) * this.positions[symbol].amount;
            }
                    
            candles[0].interval = interval;
            
            this.emit('candle', candles[0]);
            
            setTimeout(() => {
                this.subscribeCandle(symbol, interval);
            }, candles[1].time + ( candles[1].time - candles[0].time) - Date.now() - this.deltaTime+3000);
    
        });

    }

    _authRequest(method, path, query = {}, body) {

        return new Promise((resolve, reject) => {
            
            setTimeout(() => {
                
                    query.timestamp  = Date.now() - this.deltaTime;
                    query.recvWindow = 10000;
                    
                    query     = QueryString.encode(query);
                let params    = query + QueryString.encode(body);
                let signature = this._signMessage(params);
        
                return SuperAgent(method, `${this.baseURL}${path}?${query}&signature=${signature}`)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/json')
                    .set('X-MBX-APIKEY', this.key)
                    .send(body ? JSON.stringify(body) : "")
                    .then(result => { this.requestQueue--; resolve(result.body); } )
                    .catch(result => { 
                        this.requestQueue--; reject(result.response.text ); 
                    });
                    
            }, 250*this.requestQueue++);
            
        });
            
    }
    
    _connect() {
        
        this.socket = new WebSocket(`wss://fstream.binance.com/stream`);
        this.socket.on("open", async (e) => {

            if( this.isReady )
                return;
                
            let serverTime = await this.getTime();
            let listenKey  = await this.getListenKey();
            this.info      = await this.getExchangeInfo();

            this.subscribe(listenKey);
            
            this.account = await this.getAccount();
            setInterval(async () => { this.account = await this.getAccount(); }, 1000 * 60);
            
            setInterval(() => { this.getListenKey(); }, 1000 * 60 * 59);

            // Let them know we are ready.
            this.isReady = true;
            this.emit('ready');

        });
        this.socket.on("message", (message) => {
            this._handleMessage(JSON.parse(message).data);
        });
        this.socket.on("close", e => {
            
            setTimeout(() => {
                this._connect();
            }, 1000);
            
        });
        
    }
    
    _handleMessage(data) {

        // Array everything for ease of processing.
        data = Array.isArray(data) ? data : [data];

        // Loop through each message.
        data.forEach(message => {

            if(!message)
                return;

            switch(message.e) {

                case "24hrTicker":
                case "24hrMiniTicker": {
                    this.emit("ticker", {
                        type   : message.e,
                        price  : Number(message.c),
                        symbol : message.s,
                        volume : Number(message.v),
                        time   : Math.floor(message.E/1000)
                    });
                    break;
                }
                case "executionReport": {
                    break;
                }
                case "kline": {
                    
                    let candle = {
                        symbol   : message.k.s,
                        interval : message.k.i,
                        open     : Number(message.k.o),
                        high     : Number(message.k.h),
                        low      : Number(message.k.l),
                        close    : Number(message.k.c),
                        time     : Number(message.k.t)
                    }
                    
                    if( this.positions[candle.symbol] ) {
                        this.positions[candle.symbol].unrealized = (candle.close - this.positions[candle.symbol].entry) * this.positions[candle.symbol].amount;
                    }
                    
                    this.emit('candle', candle);
                    break;
                }
                case "outboundAccountPosition": {
                    break;
                }
                case "ACCOUNT_CONFIG_UPDATE": {
                    break;
                }
                case "ACCOUNT_UPDATE": {
                    message.a.B.forEach(balance => {
                        
                        this.balances[balance.a] = balance.wb;
                        
                        this.emit('balance', {
                           asset   : balance.a,
                           balance : balance.wb
                        });
                        console.log(this.balances);
                        
                    });
                    
                    message.a.P.forEach(position => {
                        
                        this.positions[position.s] = {
                            symbol     : position.s,
                            amount     : position.pa,
                            entry      : position.ep,
                            realized   : position.cr,
                            unrealized : position.up,
                            marginType : position.mt,
                            side       : position.ps
                        };
                        
                        this.emit('position', this.positions[position.s]);
                        
                    });
                    break;
                }
                case "ORDER_TRADE_UPDATE": {
                    this.emit("order", message.o);
                    break;
                }          
                default: {
                    console.warn("Unknown message type", message);
                    break;
                }
            }

        });

    }

    _request(method, path, query, body) {
        
        query = QueryString.encode(query);

        return new Promise((resolve, reject) => {
            
            setTimeout(() => {
                
                SuperAgent(method, `${this.baseURL}${path}?${query}`)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .send(body ? JSON.stringify(body) : "")
                .then(result => { this.requestQueue--; resolve(result.body); } )
                .catch(result => { this.requestQueue--; reject(result.response.error); });
                
            }, 250*this.requestQueue++)
            
        });
            
    }

    _signMessage(params) {

        return Crypto
            .createHmac('sha256', this.secret)
            .update(params)
            .digest('hex');

    }
    
}