/* ToshiNotifier / make.js
 * echo 'make script for ToshiNotifier' && node make
 * (c) 2015 David (daXXog) Volm ><> + + + <><
 * Released under Apache License, Version 2.0:
 * http://www.apache.org/licenses/LICENSE-2.0.html  
 */

var bitfactory = require('bitfactory'),
    UglifyJS = require("uglify-js"),
    stoptime = require('stoptime'),
    fs = require('fs');

var watch = stoptime(),
    header = '';

bitfactory.make({ //routes
    "": function(err, results) {
        console.log('built ToshiNotifier in ' + watch.elapsed() + 'ms.');
    }
}, { //dependencies
    "*": { //wildcard
        "header": function(cb) {
            fs.readFile('toshi-notifier.h', 'utf8', function(err, data) {
                header = data;
                cb(err);
            });
        },
        "toshi-notifier.min.js": ["header", function(cb) {
            fs.writeFileSync('toshi-notifier.min.js', header + UglifyJS.minify('toshi-notifier.js').code);
            cb();
        }]
    }
});