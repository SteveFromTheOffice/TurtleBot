module.exports = class EventEmitter {

    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        
        let handlers = this.events[event] || [];
            handlers.push(callback);
            
        this.events[event] = handlers;
        
    }
    emit(event, data) {
        
        let handlers = this.events[event];

        if (!handlers || handlers.length < 1)
            return;

        handlers.forEach(handler => {
            handler(data);
        });
        
    }
    off(event, callback) {

        if(!this.events[event])
            return;

        this.events[event] = this.events[event].filter(o => o != callback);
        
    }
    
}