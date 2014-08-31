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
        jslint: {
            all: {
                src: [ '*.js', 'test/*.js' ],
                directives: {
                    white: true
                }
            }
        },

        cafemocha: {
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
            extraHeadingLevels: 1
        },

        exec: {
            cover: {
                cmd: './node_modules/.bin/istanbul cover -x Gruntfile.js ./node_modules/.bin/grunt -- test --cover',
                maxBuffer: 10000 * 1024
            },

            check_cover: {
                cmd: './node_modules/.bin/istanbul check-coverage --statement 100 --branch 100 --function 100 --line 100'
            },

            coveralls: {
                cmd: 'cat coverage/lcov.info | coveralls'
            },

            start_phantomjs: {
                cmd: 'phantomjs --webdriver=4444 --webdriver-loglevel=ERROR --debug=false &'
            },

            stop_phantomjs: {
                cmd: 'pkill -g 0 phantomjs'
            }
        },

        webpack: {
            bundle: {
                entry: path.join(__dirname, 'test', 'fixtures', 'loader.js'),
                output: {
                    path: path.join(__dirname, 'test', 'fixtures'),
                    filename: 'bundle.js'
                },
                stats: {
                    modules: true
                }
            }
        }
    });
    
    grunt.loadNpmTasks('grunt-jslint');
    grunt.loadNpmTasks('grunt-cafe-mocha');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-exec');
    grunt.loadNpmTasks('grunt-webpack');

    grunt.registerTask('lint', 'jslint:all');
    grunt.registerTask('test', 'cafemocha:default');
    grunt.registerTask('test-examples', 'cafemocha:examples');
    grunt.registerTask('test-browser', ['exec:start_phantomjs',
                                        'sleep:10000',
                                        'usetheforce_on',
                                        'cafemocha:browser',
                                        'exec:stop_phantomjs',
                                        'usetheforce_restore']);
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', ['exec:cover', 'exec:check_cover']);
    grunt.registerTask('coveralls', 'exec:coveralls');
    grunt.registerTask('bundle', 'webpack:bundle');
    grunt.registerTask('default', ['jslint', 'cafemocha']);

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
