import { git, IGitExecutionOptions } from './core'

import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange, FileStatus } from '../../models/status'
import { Diff } from '../../models/diff'

import { DiffParser } from '../diff-parser'

export class GitDiff {

  /**
   * Render the difference between a file in the given commit and its parent
   *
   * @param commitish A commit SHA or some other identifier that ultimately dereferences
   *                  to a commit.
   */
  public static getCommitDiff(repository: Repository, file: FileChange, commitish: string): Promise<Diff> {

    const args = [ 'log', commitish, '-m', '-1', '--first-parent', '--patch-with-raw', '-z', '--', file.path ]

    return git(args, repository.path)
      .then(value => this.diffFromRawDiffOutput(value.stdout))
  }

  /**
   * Render the diff for a file within the repository working directory. The file will be
   * compared against HEAD if it's tracked, if not it'll be compared to an empty file meaning
   * that all content in the file will be treated as additions.
   */
  public static getWorkingDirectoryDiff(repository: Repository, file: WorkingDirectoryFileChange): Promise<Diff> {

    let opts: IGitExecutionOptions | undefined
    let args: Array<string>

    if (file.status === FileStatus.New) {
      // `git diff --no-index` seems to emulate the exit codes from `diff` irrespective of
      // whether you set --exit-code
      //
      // this is the behaviour:
      // - 0 if no changes found
      // - 1 if changes found
      // -   and error otherwise
      //
      // citation in source:
      // https://github.com/git/git/blob/1f66975deb8402131fbf7c14330d0c7cdebaeaa2/diff-no-index.c#L300
      opts = { successExitCodes: new Set([ 0, 1 ]) }
      args = [ 'diff', '--no-index', '--patch-with-raw', '-z', '--', '/dev/null', file.path ]
    } else if (file.status === FileStatus.Renamed) {
      // NB: Technically this is incorrect, the best way of incorrect.
      // In order to show exactly what will end up in the commit we should
      // perform a diff between the new file and the old file as it appears
      // in HEAD. By diffing against the index we won't show any changes
      // already staged to the renamed file which differs from our other diffs.
      // The closest I got to that was running hash-object and then using
      // git diff <blob> <blob> but that seems a bit excessive.
      args = [ 'diff', '--patch-with-raw', '-z', '--', file.path ]
    } else {
      args = [ 'diff', 'HEAD', '--patch-with-raw', '-z', '--', file.path ]
    }

    return git(args, repository.path, opts)
      .then(value => this.diffFromRawDiffOutput(value.stdout))
  }

  /**
   * Utility function used by get(Commit|WorkingDirectory)Diff.
   *
   * Parses the output from a diff-like command that uses `--path-with-raw`
   */
  private static diffFromRawDiffOutput(result: string): Diff {
    const pieces = result.split('\0')
    const parser = new DiffParser()
    return parser.parse(pieces[pieces.length - 1])
  }
}