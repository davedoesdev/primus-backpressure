/*global describe: false,
         it: false */
/*eslint-env node */
/*eslint-disable indent */
"use strict";

describe('examples', function ()
{
it('first', function (cb)
{

var Primus = require('primus'),
    PrimusDuplex = require('..').PrimusDuplex,
    primus = Primus.createServer({ port: 9000 }),
    Socket = primus.Socket,
    assert = require('assert'),
    read_a = false;

primus.once('connection', function (spark)
{
    var spark_duplex = new PrimusDuplex(spark,
    {
        highWaterMark: 2
    });

    assert.equal(spark_duplex.write('ab'), false);

    spark_duplex.on('drain', function ()
    {
        assert(read_a);
    });
});

var client_duplex = new PrimusDuplex(new Socket('http://localhost:9000'),
{
    highWaterMark: 1
});

client_duplex.once('readable', function ()
{
    assert.equal(this.read().toString(), 'a');
    read_a = true;
    assert.equal(this.read(), null);

    this.once('readable', function ()
    {
        assert.equal(this.read().toString(), 'b');
        primus.end(cb);
    });
});

});

it('second', function (cb)
{
this.timeout(30000);

var Primus = require('primus'),
    PrimusDuplex = require('..').PrimusDuplex,
    primus = Primus.createServer({ port: 9000 }),
    Socket = primus.Socket,
    assert = require('assert'),
    crypto = require('crypto'),
    tmp = require('tmp'),
    fs = require('fs');

primus.once('connection', function (spark)
{
    var spark_duplex = new PrimusDuplex(spark);

    tmp.tmpName(function (err, random_file)
    {
        assert.ifError(err);

        var random_buf = crypto.randomBytes(1024 * 1024);

        fs.writeFile(random_file, random_buf, function (err)
        {
            assert.ifError(err);

            tmp.tmpName(function (err, out_file)
            {
                assert.ifError(err);

                var random_stream = fs.createReadStream(random_file),
                    out_stream = fs.createWriteStream(out_file);

                out_stream.on('finish', function ()
                {
                    fs.readFile(out_file, function (err, out_buf)
                    {
                        assert.ifError(err);
                        assert.deepEqual(out_buf, random_buf);

                        fs.unlink(random_file, function (err)
                        {
                            assert.ifError(err);
                            fs.unlink(out_file, function (err)
                            {
                                assert.ifError(err);
                                primus.end(cb);
                            });
                        });
                    });
                });

                spark_duplex.pipe(out_stream);
                random_stream.pipe(spark_duplex);
            });
        });
    });
});

var client_duplex = new PrimusDuplex(new Socket('http://localhost:9000'));
client_duplex.pipe(client_duplex);

});
});
