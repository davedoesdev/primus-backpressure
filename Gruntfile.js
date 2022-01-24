/*eslint-env node */
"use strict";

const test_cmd = 'npx mocha --bail';
const c8 = "npx c8 -x Gruntfile.js -x 'test/**'";

module.exports = function (grunt)
{
    grunt.initConfig(
    {
        eslint: {
            target: [ '*.js', 'test/*.js' ]
        },

        apidox: {
            input: 'index.js',
            output: 'README.md',
            fullSourceDescription: true,
            extraHeadingLevels: 1,
            doxOptions: { skipSingleStar: true }
        },

        exec: Object.fromEntries(Object.entries({
            test: `${test_cmd} --timeout ${5 * 60 * 1000} test/_common.js test/test_node.js`,
            test_examples: `${test_cmd} test/test_examples.js`,
            test_browser: `${test_cmd} --timeout ${10 * 60 * 1000} test/_common.js test/test_browser.js`,
            cover: `${c8} npx grunt test`,
            cover_report: `${c8} report -r lcov`,
            cover_check: `${c8} check-coverage --statements 100 --branches 100 --functions 100 --lines 100`,
            start_selenium: [
                'npx selenium-standalone install',
                '(npx selenium-standalone start &)',
                'while ! nc -zv -w 5 localhost 4444; do sleep 1; done'
            ].join('&&'),
            // Note: we use escaping to stop pkill matching the sh process
            stop_selenium: "pkill -g 0 -f `echo s'\\0145'lenium-standalone`",
            bundle: 'npx webpack --mode production --config test/webpack.config'
        }).map(([k, v]) => [k, { stdio: 'inherit', ...v }]))
    });
    
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-exec');

    grunt.registerTask('lint', 'eslint');
    grunt.registerTask('test', 'exec:test');
    grunt.registerTask('test-examples', 'exec:test_examples');
    grunt.registerTask('test-browser', [
        'exec:start_selenium',
        'exec:bundle',
        'usetheforce_on',
        'exec:test_browser',
        'exec:stop_selenium',
        'usetheforce_restore'
    ]);
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', [
        'exec:cover',
        'exec:cover_report',
        'exec:cover_check'
    ]);
    grunt.registerTask('default', ['lint', 'test']);

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
