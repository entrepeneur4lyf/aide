/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Here I want to get the remote url of the current repo
// and also the hash we are on
// import logger from '../logger';
import { execCommand, runCommandAsync } from '../utilities/commandRunner';
import logger from '../logger';
import { SIDECAR_CLIENT } from '../extension';

export const getGitRepoName = async (workingDirectory: string): Promise<string> => {
	// Log the pwd here
	try {
		// const currentWorkingDirectory = realpathSync(resolve('.'));
		// logger.info('codestory');
		// logger.info(currentWorkingDirectory);
		const { stdout } = await runCommandAsync(workingDirectory, 'git', [
			'rev-parse',
			'--show-toplevel',
		]);
		const tolLevelName = stdout.trim().split('/').pop() || '';
		const data = await runCommandAsync(workingDirectory, 'basename', [tolLevelName]);
		return data.stdout.trim();
	} catch (error) {
		return 'codestory-error-no-git';
	}
};

export const getGitRemoteUrl = async (workingDirectory: string): Promise<string> => {
	try {
		const { stdout } = await runCommandAsync(workingDirectory, 'git', [
			'remote',
			'get-url',
			'origin',
		]);
		return stdout.trim();
	} catch (error) {
		return 'codestory-error-no-git';
	}
};

export const getGitCurrentHash = async (workingDirectory: string): Promise<string> => {
	try {
		const { stdout } = await runCommandAsync(workingDirectory, 'git', ['rev-parse', 'HEAD']);
		logger.info('Whats the stdout');
		logger.info(stdout);
		return stdout.trim();
	} catch (error) {
		return 'codestory-error-no-git';
	}
};

export const getFilesTrackedInWorkingDirectory = async (workingDirectory: string): Promise<string[]> => {
	try {
		const { stdout } = await runCommandAsync(workingDirectory, 'git', ['ls-files']);
		const fileList = stdout.trim().split('\n').filter((x) => x.length > 0);
		// now we join the working directory with the file name
		const filesWithWorkingDirectory = fileList.map((file) => {
			return `${workingDirectory}/${file}`;
		});
		return filesWithWorkingDirectory;
	} catch (error) {
		return [];
	}
};

// Returns the files which were touched in the last 2 weeks
export const getFilesInLastCommit = async (workingDirectory: string): Promise<string[]> => {
	// command we have to run is the following:
	// https://chat.openai.com/share/d516b75e-1567-4ce2-b96f-80ba6272adf0
	const stdout = await execCommand(
		'git log --pretty="%H" --since="2 weeks ago" | while read commit_hash; do git diff-tree --no-commit-id --name-only -r $commit_hash; done | sort | uniq -c | awk -v prefix="$(git rev-parse --show-toplevel)/" \'{ print prefix $2, $1 }\' | sort -k2 -rn',
		workingDirectory,
	);
	// Now we want to parse this output out, its always in the form of
	// {file_path} {num_tries} and the file path here is relative to the working
	// directory
	const splitLines = stdout.split('\n');
	const finalFileList: string[] = [];
	for (let index = 0; index < splitLines.length; index++) {
		const lineInfo = splitLines[index].trim();
		if (lineInfo.length === 0) {
			continue;
		}
		// split it by the space
		const splitLineInfo = lineInfo.split(' ');
		if (splitLineInfo.length !== 2) {
			continue;
		}
		const filePath = splitLineInfo[0];
		finalFileList.push(filePath);
	}
	return finalFileList;
};

export const getStagedChanges = async (workingDirectory: string): Promise<string> => {
    try {
        const { stdout } = await runCommandAsync(workingDirectory, 'git', ['diff', '--staged']);
        return stdout.trim();
    } catch (error) {
        return '';
    }
};

export const generateCommitMessage = async (workingDirectory: string): Promise<string> => {
    try {
        // Get staged changes
        const stagedDiff = await getStagedChanges(workingDirectory);
        if (!stagedDiff) {
            return 'No staged changes found';
        }

        // Get list of staged files
        const { stdout: stagedFiles } = await runCommandAsync(workingDirectory, 'git', ['diff', '--staged', '--name-only']);
        const files = stagedFiles.trim().split('\n');

        // Prepare prompt for commit message generation
        const prompt = `Generate a concise commit message in conventional commits format for the following changes:\n\nFiles changed:\n${files.join('\n')}\n\nChanges:\n${stagedDiff}\n\nThe commit message should follow the format: type(scope): description\nwhere type is one of: feat, fix, docs, style, refactor, test, chore\nKeep the message concise and descriptive.`;
        
        // Use sidecar client to generate commit message
        if (SIDECAR_CLIENT) {
            const response = await SIDECAR_CLIENT.getCompletion(prompt);
            if (response && response.trim()) {
                return response.trim();
            }
        }
        
        // Fallback to basic message if LLM fails
        const fileCount = files.length;
        const fileList = files.slice(0, 3).join(', ') + (fileCount > 3 ? ` and ${fileCount - 3} more files` : '');
        return `feat: update ${fileList}`;
    } catch (error) {
        logger.error('Error generating commit message:', error);
        return 'Error generating commit message';
    }
};