//import opn from 'opn';
const opn = require('opn');

import * as jsonFile from 'jsonfile';
import * as _ from 'lodash';
import * as fs from 'fs-extra';
import * as path from 'path';

import { collectJSONS } from './jsonDir';
import { searchFileUp } from './searchFileUp';
import { getBaseDir, getFeatureHierarchy, findOrCreateSubSuite, recursivelyIncrementStat } from './hierarchyReporter';
import { IFeatureSuite, IFeature, IElement } from './models/FeatureSuite';
import { IPackageJson } from './models/PackageJson';
import { IOptions } from './models/Options';


////////////////////////////////////////////////////////////////////////////////////
// Utils
const sanitize = function (name: string, find: RegExp) {
  const unsafeCharacters = find || /[/\|:"*?<>]/g;
  if (name !== undefined) {
      name = name.trim().replace(unsafeCharacters, '_');
  }
  return name;
};

const createReportDirectoryIfNotExists = function (options: IOptions) {
    if (!fs.existsSync(options.output)) {
        fs.mkdirsSync(path.dirname(options.output));
    }
};

const getColumnLayoutWidth = function(options: IOptions) {
    const FULL_WIDTH = 12;
    const HALF_WIDTH = 6;

    if (options.columnLayout === 1) {
        return FULL_WIDTH;
    } else {
        return HALF_WIDTH;
    }
};

const format = function(min: number, sec: number, ms: number) {
    const MINUTES = 'm ';
    const SECONDS = 's ';
    const MILLI_SECONDS = 'ms';

    var formattedTimeStamp = '';

    min > 0 ? formattedTimeStamp += min + MINUTES : '';
    sec > 0 ? formattedTimeStamp += sec + SECONDS : '';
    ms > 0 ? formattedTimeStamp += ms + MILLI_SECONDS : '';

    return formattedTimeStamp.trim().length === 0 ? '< 1ms' : formattedTimeStamp;
};

/**
* Make human-readable duration for scenario steps
* Sample Input: "2005366787"
* Sample Output: "2s 5ms"
*/
const calculateDuration = function (durationInNanoSeconds: number) {
  // convert it to MILLI_SECONDS
  const durationInMillis = _.floor(durationInNanoSeconds / 1000000);
  const oneMilliSecond = 1000;
  const oneMinute = 60 * oneMilliSecond;

  let formattedDuration = '0s';

  if (!isNaN(durationInMillis)) {

      const min = _.floor(durationInMillis / oneMinute);
      const sec = _.floor((durationInMillis % oneMinute) / oneMilliSecond);
      const ms = durationInMillis % oneMilliSecond;

      formattedDuration = format(min, sec, ms);
  }

    return formattedDuration;
};

const preventOverlappingTheScenarioTitle = function (element) {
    var counter = 0;

    if (element.passed) counter++;
    if (element.notdefined) counter++;
    if (element.pending) counter++;
    if (element.skipped) counter++;
    if (element.failed) counter++;
    if (element.ambiguous) counter++;

    counter = (counter * 20) + 10;

    return counter + 'px';
};

const readFileForRespectiveTemplates = function (options: IOptions, filename: string) {
    if (filename === 'script.js' && options.theme === 'foundation') {
        return readFile(options, '../_common/foundation/' + filename);
    }

    return ((options.theme === 'bootstrap') || (options.theme === 'hierarchy'))
      ? readFile(options, '../_common/bootstrap.hierarchy/' + filename)
      : readFile(options, filename);
};

/**
* NOTE: This method is used by hierarchy report template, harmless for others.
* Creates the HTML fragments for any features assigned to this suite,
* and stores them in `featureMarkup` attribute of the suite so we can render them in index.tmpl
*
* @param suite
*/
const getFeaturesTemplate = function (options: IOptions, suite: IFeatureSuite) {
    return _.template(readFileForRespectiveTemplates(options, 'features.html'))({
        suite: suite,
        _: _,
        calculateDuration: calculateDuration,
        columnLayoutWidth: getColumnLayoutWidth(options),
        decideScenarioTitlePadding: preventOverlappingTheScenarioTitle
    });
};

const setupSubSuiteTemplates = function (options: IOptions, suite: IFeatureSuite) {
    suite.featureMarkup = '<div style="display: none;">No features</div>';
    if (suite.features && suite.features.length) {
        suite.featureMarkup = getFeaturesTemplate(options, suite);
    }
    for (var i = 0; i < suite.suites.length; i++) {
        const subSuite = suite.suites[i];
        setupSubSuiteTemplates(options, subSuite);
    }
};

const setStats = function (options: IOptions, suite: IFeatureSuite) {
    var featureOutput = suite.features;
    var topLevelFeatures = [];
    var featuresSummary = suite.featuresSummary;
    var screenshotsDirectory: string;

    suite.reportAs = 'Features';

    if (options.screenshotsDirectory) {
        screenshotsDirectory = options.screenshotsDirectory;
    } else {
        screenshotsDirectory = options.output ? path.join(options.output, '..', 'screenshots') : 'screenshots';
    }

    var basedir = getBaseDir(suite);

    featureOutput.forEach(function (feature: IFeature) {
        feature.hierarchy = getFeatureHierarchy(feature.uri, basedir);

        feature.scenarios = {
          passed: 0,
          failed: 0,
          notdefined: 0,
          skipped: 0,
          pending: 0,
          ambiguous: 0,
          count: 0
        };

        feature.time = 0;
        featuresSummary.isFailed = false;
        featuresSummary.isAmbiguous = false;

        if (!feature.elements) {
            return;
        }

        feature.elements.forEach(function (element: IElement) {
            element.passed = 0;
            element.failed = 0;
            element.notdefined = 0;
            element.skipped = 0;
            element.pending = 0;
            element.ambiguous = 0;
            element.time = 0;

            if (element.type === 'background') {
                return;
            }

            element.steps.forEach(function (step) {
                if (step.embeddings !== undefined) {
                    step.embeddings.forEach(function (embedding) {

                        var embeddingType = {};

                        if (embedding.mime_type) {
                            embeddingType = embedding.mime_type;
                        } else if (embedding.media) {
                            embeddingType = embedding.media.type;
                        }

                        if (embeddingType === 'text/plain' || embeddingType === 'text/html') {

                            var decoded;

                            if (embeddingType === 'text/html') {
                                decoded = new Buffer(embedding.data, 'base64').toString('ascii');
                            } else {
                                decoded = embedding.data;
                            }

                            if (!step.text) {
                                step.text = decoded;
                            } else {
                                step.text = step.text.concat('<br>' + embedding.data);
                            }
                        } else if (embeddingType === 'application/json') {
                            var decoded = new Buffer(embedding.data, 'base64').toString('ascii');

                            if (!step.text) {
                                step.text = decoded;
                            } else {
                                step.text = step.text.concat('<br>' + decoded);
                            }
                        } else if (embeddingType === 'image/png') {
                            step.image = 'data:image/png;base64,' + embedding.data;

                            if ((options.storeScreenshots && options.storeScreenshots === true) ||
                                (options.storeScreenshots && options.storeScreenshots === true)) {

                                var name = sanitize(step.name || step.keyword, /[^a-zA-Z0-9/-]+/g); // Only allow URL-friendly file names
                                if (!fs.existsSync(screenshotsDirectory)) {
                                    fs.mkdirSync(screenshotsDirectory);
                                }
                                name = name + '_' + Math.round(Math.random() * 10000) + '.png'; //randomize the file name
                                var filename = path.join(screenshotsDirectory, name);
                                fs.writeFileSync(filename, embedding.data, 'base64');
                                if (options.noInlineScreenshots) step.image = path.relative(path.join(options.output, '..'), filename);
                            }
                        } else {
                            var file = 'data:application/octet-stream;base64,' + embedding.data;
                            var fileType = embedding.mime_type.split('/')[1];
                            step.text = step.text || '';
                            step.text = step.text.concat('<a href="' + file + '" download="file.' + fileType + '">download file</a>');
                        }
                    });
                }

                if (!step.result || (step.hidden && !step.text && !step.image)) {
                    return 0;
                }

                if (step.result.duration) element.time += step.result.duration;

                switch (step.result.status) {
                    case result.status.passed:
                        return element.passed++;
                    case result.status.failed:
                        return element.failed++;
                    case result.status.undefined:
                        return element.undefined++;
                    case result.status.pending:
                        return element.pending++;
                    case result.status.ambiguous:
                        return element.ambiguous++;
                    default:
                        break;
                }

                element.skipped++;
            });

            if (element.time > 0) {
                feature.time += element.time;
            }

            feature.scenarios.count++;

            if (element.failed > 0) {
                feature.scenarios.failed++;
                featuresSummary.isFailed = true;
                return suite.scenarios.failed++;
            }

            if (element.ambiguous > 0) {
                feature.scenarios.ambiguous++;
                featuresSummary.isAmbiguous = true;
                return suite.scenarios.ambiguous++;
            }

            if (element.notdefined > 0) {
                feature.scenarios.notdefined++;
                return suite.scenarios.notdefined++;
            }

            if (element.pending > 0) {
                feature.scenarios.pending++;
                return suite.scenarios.pending++;
            }

            if (element.skipped > 0) {
                feature.scenarios.skipped++;
                return suite.scenarios.skipped++;
            }

            if (element.passed > 0) {
                feature.scenarios.passed++;
                return suite.scenarios.passed++;
            }

        });

        var subSuite = undefined;
        if (options.theme === 'hierarchy') {
            subSuite = hierarchyReporter.findOrCreateSubSuite(suite, feature.hierarchy);
        }
        if (subSuite) {
            subSuite.features.push(feature);
        } else {
            topLevelFeatures.push(feature);
        }

        if (featuresSummary.isFailed) {
            featuresSummary.failed++;
            subSuite ? hierarchyReporter.recursivelyIncrementStat(subSuite, 'failed') : suite.failed++;
        } else if (featuresSummary.isAmbiguous) {
            featuresSummary.ambiguous++;
            subSuite ? hierarchyReporter.recursivelyIncrementStat(subSuite, 'ambiguous') : suite.ambiguous++;
        } else if (feature.scenarios.count === feature.scenarios.skipped) {
            featuresSummary.skipped++;
            subSuite ? hierarchyReporter.recursivelyIncrementStat(subSuite, 'passed') : suite.passed++;
        } else if (feature.scenarios.count === feature.scenarios.notdefined) {
            featuresSummary.notdefined++;
            subSuite ? hierarchyReporter.recursivelyIncrementStat(subSuite, 'passed') : suite.passed++;
        } else if (feature.scenarios.count === feature.scenarios.pending) {
            featuresSummary.pending++;
            subSuite ? hierarchyReporter.recursivelyIncrementStat(subSuite, 'passed') : suite.passed++;
        } else {
            featuresSummary.passed++;
            subSuite ? hierarchyReporter.recursivelyIncrementStat(subSuite, 'passed') : suite.passed++;
        }

        if (options.reportSuiteAsScenarios) {
            suite.failed = suite.scenarios.failed;
            suite.passed = suite.scenarios.passed;
            suite.ambiguous = suite.scenarios.ambiguous;
            suite.reportAs = 'scenarios';
        }

        if (feature.time) {
            suite.totalTime += feature.time
        }

        suite.features = topLevelFeatures;
        suite.features.summary = featuresSummary;

        return suite;

    });

    suite.totalTime = calculateDuration(suite.totalTime);

    if (options.theme === 'hierarchy') {
        setupSubSuiteTemplates(suite);
    }

    if (options.metadata) suite.metadata = options.metadata;

    return suite;
};

function getPath(options: IOptions, name: string) {
  //use custom template based on user's requirement
  if (options.templateDir && fs.existsSync(path.join(options.templateDir, name))) {
      return path.join(options.templateDir, name);
  } else {
      return path.join(__dirname, '..', 'templates', options.theme, name);
  }
}

function readFile(options: IOptions, fileName: string) {
  const filePath = getPath(options, fileName);
  return fs.readFileSync(filePath, 'utf-8');
}

function isValidJsonFile(options: IOptions, callback) {
    options.jsonFile = options.jsonFile || options.output + '.json';

    try {
        JSON.parse(JSON.stringify(jsonFile.readFileSync(options.jsonFile)));
        return true;
    } catch (e) {
        console.error('Unable to parse cucumberjs output into json: \'%s\'', options.jsonFile, e);
        if (callback) {
            callback('Unable to parse cucumberjs output into json: \'' + options.jsonFile + '\'. Error: ' + e);
        } else {
            return false;
        }
    }
}

function launchReport(options: IOptions) {
    if (fs.existsSync(options.output) && (options.launchReport)) {
        opn(options.output);
    }
}
////////////////////////////////////////////////////////////////////////////////////



var generateReport = function (options: IOptions) {

    var featureOutput = jsonFile.readFileSync(options.jsonFile);
    var packageJsonPath = searchFileUp('package.json');
    var packageJson: IPackageJson = {};

    try {
        packageJson = packageJsonPath && jsonFile.readFileSync(packageJsonPath, 'utf8');
    } catch (err) {
        console.warn('No package.json file found in: ' + packageJsonPath + ', using default name and version.');
        packageJson.name = 'default';
        packageJson.version = '0.0.0';
    }



    featureOutput.summary = {
        isFailed: false,
        passed: 0,
        failed: 0,
        ambiguous: 0,
        skipped: 0,
        notdefined: 0,
        pending: 0
    };

    var featureOutputSummary = {

        isFailed: false,
        passed: 0,
        failed: 0,
        ambiguous: 0,
        skipped: 0,
        notdefined: 0,
        pending: 0
    };

    var result = {
        status: {
            passed: 'passed',
            failed: 'failed',
            skipped: 'skipped',
            pending: 'pending',
            undefined: 'undefined',
            ambiguous: 'ambiguous'
        }
    };

    var suite: IFeatureSuite = {
        name: {
            plain: options.name || packageJson && packageJson.name,
            sanitized: sanitize(options.name || packageJson && packageJson.name, /[^a-z|0-9]/g)
        },
        brandTitle: options.brandTitle,
        version: packageJson && packageJson.version,
        time: new Date(),
        features: featureOutput,
        featuresSummary: `featureOutputSummary`,

        passed: 0,
        failed: 0,
        ambiguous: 0,
        totalTime: 0,
        suites: [],
        scenarios: {
            passed: 0,
            failed: 0,
            skipped: 0,
            pending: 0,
            notdefined: 0,
            ambiguous: 0
        }
    };


    createReportDirectoryIfNotExists();


    suite = setStats(suite);

    fs.writeFileSync(
        options.output,
        _.template(readFile('index.html'))({
            suite: suite,
            features: getFeaturesTemplate(suite),
            styles: readFileForRespectiveTemplates('style.css'),
            script: readFileForRespectiveTemplates('script.js'),
            screenshot: readFile('../_common/screenshot.js'),
            piechart: ((options.theme === 'bootstrap') || (options.theme === 'hierarchy')) ? readFileForRespectiveTemplates('piechart.js') : undefined
        })
    );

    console.log('Cucumber HTML report ' + options.output + ' generated successfully.');
};


////////////////////////////////////////////////////////////////////////////////////

export function generate(options: IOptions, callback) {

    if (options.jsonDir) {
        collectJSONS(options)
    }

    if (isValidJsonFile()) {
        generateReport(options);
        launchReport();
        return callback ? callback() : true;
    }
}
