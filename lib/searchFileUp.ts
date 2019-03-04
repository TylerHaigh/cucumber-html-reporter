import * as fs from 'fs-extra';
import * as path from 'path';

function exists(filePath: string) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (err) {
        return false;
    }
}

export function searchFileUp(fileName: string) {
    var pathParts = process.cwd().split(path.sep);

    var filePath = pathParts.concat([fileName]).join(path.sep);

    while (!exists(filePath) && pathParts.length) {
        pathParts.pop();
        filePath = pathParts.concat([fileName]).join(path.sep);
    }

    return filePath;
}
