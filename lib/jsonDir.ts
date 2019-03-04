import * as jsonFile from 'jsonfile';
import * as find from 'find';
import { IOptions } from './models/Options';


function mergeJSONS(file: string, options: IOptions) {
    var cucumberJson = jsonFile.readFileSync(file);

    if ((!cucumberJson || typeof cucumberJson[0] === 'undefined') && !options.ignoreBadJsonFile) {
        throw new Error('Invalid Cucumber JSON file found under ' + options.jsonDir + ': ' + file);
    } else if ((!cucumberJson || typeof cucumberJson[0] === 'undefined') && options.ignoreBadJsonFile) {
        console.log('Invalid Cucumber JSON file found under ' + options.jsonDir + ': ' + file);
    }
    else {
        //cucumberJson.map(collect)
        return cucumberJson
    }
}

// function collect(json: string) {
//     jsonOutput.push(json);
// }

export function collectJSONS (options: IOptions) {
    var jsonOutput = [];
    var files = [];

    try {
        files = find.fileSync(/\.json$/, options.jsonDir);
    } catch (e) {
        throw new Error('\'options.jsonDir\' does not exist. ' + e);
    }

    if (files.length === 0) throw new Error('No JSON files found under \'options.jsonDir\': ' + options.jsonDir);

    files.forEach( (file) => {
        const cucumberJson = mergeJSONS(file, options);
        cucumberJson.map( (json: string) => jsonOutput.push(json));
    });

    jsonFile.writeFileSync(options.output + '.json', jsonOutput, {spaces: 2});

    return jsonOutput;
};
