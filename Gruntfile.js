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
            test_browser: 'npx wdio',
            cover: `${c8} npx grunt test`,
            cover_report: `${c8} report -r lcov`,
            cover_check: `${c8} check-coverage --statements 100 --branches 100 --functions 100 --lines 100`,
            bundle: 'npx webpack --mode production --config test/webpack.config'
        }).map(([k, cmd]) => [k, { cmd, stdio: 'inherit' }]))
    });
    
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-exec');

    grunt.registerTask('lint', 'eslint');
    grunt.registerTask('test', 'exec:test');
    grunt.registerTask('test-examples', 'exec:test_examples');
    grunt.registerTask('test-browser', [
        'exec:bundle',
        'exec:test_browser',
    ]);
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', [
        'exec:cover',
        'exec:cover_report',
        'exec:cover_check'
    ]);
    grunt.registerTask('default', ['lint', 'test']);
};
