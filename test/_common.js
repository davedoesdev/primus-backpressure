/*global path: false,
         Primus: false,
         server_port: false,
         PrimusDuplex: false,
         primus: false,
         before: false,
         after: false,
         random_fname: false,
         drain: false */
/*eslint-env node */
"use strict";

global.Primus = require('primus');
global.PrimusDuplex = require('..').PrimusDuplex;
global.fs = require('fs');
global.path = require('path');
global.tmp = require('tmp');
global.async = require('async');
global.server_port = 7000;
global.client_url = 'http://localhost:7000';
global.static_url = 'http://localhost:7001';
global.random_fname = path.join(__dirname, 'fixtures', 'random');

const { promisify } = require('util');
const { writeFile, unlink } = require('fs/promises');

let spark_duplex;

before(async () =>
{
    global.expect = (await import('chai')).expect;
});

before(function ()
{
    global.primus = Primus.createServer(
    {
        port: server_port
    });

    global.Socket = primus.Socket;
});

after(async function ()
{
    await primus.destroy.bind(primus)();
});

before(async function ()
{
    await promisify(primus.save.bind(primus))(path.join(__dirname, 'fixtures', 'primus.js'));
});

before(async function ()
{
    var buf = require('crypto').randomBytes(1024 * 1024);
    await writeFile(random_fname, buf);
});

after(async function ()
{
    await unlink(random_fname);
});

global.connect = function (make_client)
{
    return function (cb)
    {
        var client_done = false, spark_done = false;

        primus.once('connection', function (spark)
        {
            spark_duplex = new PrimusDuplex(spark,
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
