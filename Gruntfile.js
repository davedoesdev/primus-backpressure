/*global timeout: false,
         browser_timeout: false */
/*jslint node: true, nomen: true */
"use strict";

var path = require('path');

global.timeout = 5 * 60 * 1000;
global.browser_timeout = 10 * 60 * 1000;

module.exports = function (grunt)
{
    grunt.initConfig(
    {
        jshint: {
            src: [ '*.js', 'test/*.js' ]
        },

        mochaTest: {
            default: {
                src: [ 'test/_common.js', 'test/test_node.js' ],
                options: {
                    timeout: timeout,
                    bail: true
                }
            },

            examples: 'test/test_examples.js',
            
            browser: {
                src: [ 'test/_common.js', 'test/test_browser.js' ],
                options: {
                    timeout: browser_timeout,
                    bail: true
                }
            }
        },

        apidox: {
            input: 'index.js',
            output: 'README.md',
            fullSourceDescription: true,
            extraHeadingLevels: 1,
            doxOptions: { skipSingleStar: true }
        },

        exec: {
            cover: {
                cmd: "./node_modules/.bin/nyc -x Gruntfile.js -x 'test/**' ./node_modules/.bin/grunt test"
            },

            cover_report: {
                cmd: './node_modules/.bin/nyc report -r lcov'
            },

            cover_check: {
                cmd: './node_modules/.bin/nyc check-coverage --statements 100 --branches 100 --functions 100 --lines 100'
            },

            coveralls: {
                cmd: 'cat coverage/lcov.info | coveralls'
            },

            start_phantomjs: {
                cmd: './node_modules/.bin/phantomjs --webdriver=4444 --webdriver-loglevel=ERROR --debug=false &'
            },

            stop_phantomjs: {
                cmd: 'pkill -g 0 phantomjs'
            },

            bundle: {
                cmd: './node_modules/.bin/webpack --mode production --config test/webpack.config'
            }
        }
    });
    
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-exec');

    grunt.registerTask('lint', 'jshint');
    grunt.registerTask('test', 'mochaTest:default');
    grunt.registerTask('test-examples', 'mochaTest:examples');
    grunt.registerTask('test-browser', ['exec:start_phantomjs',
                                        'exec:bundle',
                                        'sleep:10000',
                                        'usetheforce_on',
                                        'mochaTest:browser',
                                        'exec:stop_phantomjs',
                                        'usetheforce_restore']);
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', ['exec:cover',
                                    'exec:cover_report',
                                    'exec:cover_check']);
    grunt.registerTask('coveralls', 'exec:coveralls');
    grunt.registerTask('default', ['lint', 'test']);

    grunt.registerTask('sleep', function (ms)
    {
        setTimeout(this.async(), ms);
    });

    // http://stackoverflow.com/questions/16612495/continue-certain-tasks-in-grunt-even-if-one-fails

    grunt.registerTask('usetheforce_on',
                       'force the force option on if needed',
    function()
    {
        if (!grunt.option('force'))
        {
            grunt.config.set('usetheforce_set', true);
            grunt.option('force', true);
        }
    });

    grunt.registerTask('usetheforce_restore',
                       'turn force option off if we have previously set it', 
    function()
    {
        if (grunt.config.get('usetheforce_set'))
        {
            grunt.option('force', false);

            if (grunt.fail.warncount > 0)
            {
                grunt.fail.warn('previous warnings detected');
            }
        }
    });
};
