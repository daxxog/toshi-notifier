/* ToshiNotifier
 * Redis push notifications for bitcoin.
 * (c) 2015 David (daXXog) Volm ><> + + + <><
 * Released under Apache License, Version 2.0:
 * http://www.apache.org/licenses/LICENSE-2.0.html  
 */

/* UMD LOADER: https://github.com/umdjs/umd/blob/master/returnExports.js */
(function (root, factory) {
    if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(factory);
    } else {
        // Browser globals (root is window)
        root.ToshiNotifier = factory();
  }
}(this, function() {
    var redis = require('redis'),
        async = require('async'),
        request = require('request'),
        sf = require('switch-factory'),
        WebSocket = require('websocket').w3cwebsocket,
        ToshiNotifier;
    
    ToshiNotifier = function(settings) {
        var that = this;
        
        this.client = redis.createClient(settings.port, settings.host);
        this.prefix = ToshiNotifier.PREFIX;
        this.endpoint = ToshiNotifier.ENDPOINT;
        this.version = ToshiNotifier.VERSION;
        this.timeout = ToshiNotifier.TIMEOUT;
        this.window = ToshiNotifier.WINDOW;
        this.firehose = ToshiNotifier.FIREHOSE;
        
        if(typeof settings.auth === 'string') {
            this.client.auth(settings.auth);
        }
        
        async.forever(function(next) {
            that.client.pubsub('CHANNELS', 'toshi.address.*', function(err, data) {
                if(!err) {
                    if(data.length > 0) {
                        that.SwitchAddress = sf.is(data.map(function(v) {
                            return v.split('.')[2];
                        }));
                    }
                }
                
                setTimeout(next, that.timeout * 10);
            });
        }, function(err) {err;/* never called */});
        
        async.forever(function(next) {
            var toshi = new WebSocket('wss://' + that.endpoint);
            
            toshi.subscribe = function(to) {
                this.send(JSON.stringify({
                    subscribe: to
                }));
            };
            
            toshi.fetch = function(what) {
                this.send(JSON.stringify({
                    fetch: what
                }));
            };
            
            toshi.onopen = function() {
                this.fetch('latest_block');
                this.subscribe('blocks');
                
                this.fetch('latest_transaction');
                this.subscribe('transactions');
            };
            
            toshi.onclose = function() {
                setTimeout(next, that.timeout);
            };
            
            toshi.onmessage = function(ev) {
                try {
                    var notification = JSON.parse(ev.data);
                    
                    if(notification.subscription === 'blocks') {
                        that.publish('blocks', notification.data);
                    }
                    
                    if(notification.fetched === 'latest_block') {
                        that.publish('blocks', notification.data);
                    }
                    
                    if(that.firehose) {
                        if(notification.subscription === 'transactions') {
                            that.publish('firehose', notification.data);
                        }
                        
                        if(notification.fetched === 'latest_transaction') {
                            that.publish('firehose', notification.data);
                        }
                    }
                    
                    if(notification.subscription === 'transactions') {
                        notification.data.outputs.forEach(function(output) {
                            output.addresses.forEach(function(address) {
                                if(that.switch(address)) {
                                    that.publish('address', address, notification.data);
                                    
                                    that.client.set(that.getDB('transactions', notification.data.hash), address, function(err, data) {
                                        if(!err) {
                                            that.client.expire(that.getDB('transactions', notification.data.hash), that.window, function(err) {err;});
                                        }
                                    });
                                }
                            });
                        });
                    }
                    
                    if(notification.fetched === 'latest_block') {
                        that.client.keys(that.getDB('transactions', '*'), function(err, data) {
                            if(!err) {
                                if(data.length > 0) {
                                    var transactions = data.map(function(v) {
                                        return v.split('.')[2];
                                    });
                                    
                                    transactions.forEach(function(tx) {
                                        request(['https:/', that.endpoint, 'api', that.version, 'transactions', tx].join('/'), function(err, res, data) {
                                            if(!err) {
                                                that.client.get(that.getDB('transactions', tx), function(err, address) {
                                                    if(!err) {
                                                        that.publish('address', address, data);
                                                    }
                                                });
                                            }
                                        });
                                    });
                                }
                            }
                        });
                    }
                } catch (e) {
                    //JSON PARSE FAILED; continue
                }
            };
        }, function(err) {err;/* never called */});
    };
    
    ToshiNotifier.prototype.getDB = function(one, two) {
        var dba = [this.prefix, one];
        
        if(typeof two === 'string') {
            dba.push(two);
        }
        
        return dba.join('.');
    };
    
    ToshiNotifier.prototype.publish = function(one, two, three) {
       if(typeof three === 'undefined') {
           this.client.publish(this.getDB(one), JSON.stringify(two));
       } else {
           this.client.publish(this.getDB(one, two), JSON.stringify(three));
       }
    };
    
    ToshiNotifier.prototype.switch = function(address) {
        if(typeof this.SwitchAddress === 'function') {
            return this.SwitchAddress(address);
        } else {
            return false;
        }
    };
    
    ToshiNotifier.PREFIX = 'toshi';
    ToshiNotifier.ENDPOINT = 'bitcoin.toshi.io';
    ToshiNotifier.VERSION = 'v0';
    ToshiNotifier.TIMEOUT = 750;
    ToshiNotifier.WINDOW = 2160 /* SIX HOURS */;
    ToshiNotifier.FIREHOSE = false;
    
    return ToshiNotifier;
}));
