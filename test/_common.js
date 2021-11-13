/*global path: false,
         Primus: false,
         server_port: false,
         beforeEach: false,
         PrimusDuplex: false,
         spark_duplex: false,
         primus: false,
         before: false,
         Socket: false,
         client_url: false,
         afterEach: false,
         crypto: false,
         fs: false,
         after: false,
         server: false,
         static_port: false,
         random_fname: false,
         drain: false */
/*jslint node: true, nomen: true */
"use strict";

global.Primus = require('primus');
global.PrimusDuplex = require('..').PrimusDuplex;
global.expect = require('chai').expect;
global.crypto = require('crypto');
global.fs = require('fs');
global.path = require('path');
global.tmp = require('tmp');
global.async = require('async');
global.server_port = 7000;
global.static_port = 7001;
global.client_url = 'http://localhost:7000';
global.static_url = 'http://localhost:7001';
global.random_fname = path.join(__dirname, 'fixtures', 'random');

before(function (cb)
{
    var http = require('http'),
        finalhandler = require('finalhandler'),
        serve_static = require('serve-static'),
        serve = serve_static(path.join(__dirname, 'fixtures'));

    global.server = http.createServer(function (req, res)
    {
        serve(req, res, finalhandler(req, res));
    });

    server.listen(static_port, cb);
});

after(function (cb)
{
    server.close(cb);
});

before(function ()
{
    global.primus = Primus.createServer(
    {
        port: server_port
    });

    global.Socket = primus.Socket;
});

after(function (cb)
{
    primus.destroy(cb);
});

before(function (cb)
{
    primus.save(path.join(__dirname, 'fixtures', 'primus.js'), cb);
});

before(function (cb)
{
    var buf = crypto.randomBytes(1024 * 1024);
    fs.writeFile(random_fname, buf, cb);
});

after(function (cb)
{
    fs.unlink(random_fname, cb);
});

global.connect = function (make_client)
{
    return function (cb)
    {
        var client_done = false, spark_done = false;

        primus.once('connection', function (spark)
        {
            global.spark_duplex = new PrimusDuplex(spark,
            {
                highWaterMark: 100
            });

            spark_duplex.name = 'server';

            spark_done = true;
            if (client_done) { cb(); }
        });

        make_client(function (err)
        {
            if (err) { return cb(err); }
            client_done = true;
            if (spark_done) { cb(); }
        });
    };
};

global.drain = function ()
{
    var buf;
    do
    {
        buf = this.read();
    } while (buf !== null);
};

global.closedown = function (close_client)
{
    return function (cb)
    {
        spark_duplex.end();

        close_client(function (err)
        {
            if (err) { return cb(err); }
            if (spark_duplex._readableState.ended) { return cb(); }

            spark_duplex.on('end', cb);

            // read out any existing data
            spark_duplex.on('readable', drain);
            drain.call(spark_duplex);
        });
    };
};

global.get_server = function ()
{
    return spark_duplex;
};

global.expr = function (v) { return v; };

