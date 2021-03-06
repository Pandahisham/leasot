var fs = require('fs');
var getStdin = require('get-stdin');
var globby = require('globby');
var logSymbols = require('log-symbols');
var mapLimit = require('async/mapLimit');
var path = require('path');

var leasot = require('../index');
var DEFAULT_EXTENSION = '.js';
var concurrencyLimit = 50;

function getFiletype(specified, file) {
    return specified || path.extname(file) || DEFAULT_EXTENSION;
}

function parseContentSync(content, params) {
    params = params || {};
    var file = params.file;
    var ext = getFiletype(params.ext, file);
    var associateParser = params.associateParser;

    leasot.associateExtWithParser(associateParser);

    if (!leasot.isExtSupported(ext)) {
        if (params.skipUnsupported) {
            return [];
        }
        console.log(logSymbols.error, 'Filetype ' + ext + ' is unsupported.');
        process.exit(1);
    }
    return leasot.parse({
        content: content,
        customTags: params.tags,
        ext: ext,
        fileName: file,
        withInlineFiles: params.inlineFiles,
    });
}

function outputTodos(todos, reporter) {
    try {
        var output = leasot.reporter(todos, {
            reporter: reporter
        });
        console.log(output);
    } catch (e) {
        console.error(e);
    }
    process.exit(todos.length ? 1 : 0);
}

function parseAndReportFiles(fileGlobs, program) {
    var cwd = process.cwd();
    var ignore = program.ignore || [];

    // Get all files and their resolved globs
    var files = globby.sync(fileGlobs, {
        cwd: cwd,
        ignore: ignore,
        nodir: true,
    });

    if (!files || !files.length) {
        console.log(logSymbols.warning, 'No files found for parsing');
        return process.exit(1);
    }

    // Parallel read all of the given files
    mapLimit(files, concurrencyLimit, function (file, cb) {
        fs.readFile(path.resolve(cwd, file), 'utf8', cb);
    }, function (err, results) {
        if (err) {
            console.log(err);
            return process.exit(1);
        }
        var todos = results.map(function (content, i) {
            var parseParams = Object.assign({ file: files[i] }, program);
            return parseContentSync(content, parseParams);
        }).filter(function (item) {
            // filter files without any parsed content
            return item && item.length > 0;
        }).reduce(function (items, item) {
            // flatten list
            return items.concat(item);
        }, []);

        outputTodos(todos, program.reporter);
    });
}

module.exports = function (program) {
    if (!process.stdin.isTTY) {
        return getStdin().then(function (content) {
            var todos = parseContentSync(content, program);
            outputTodos(todos, program.reporter);
        }).catch(function (e) {
            console.error(e);
            process.exit(1);
        });
    }
    if (!program.args.length) {
        return program.help();
    }
    parseAndReportFiles(program.args, program);
};
