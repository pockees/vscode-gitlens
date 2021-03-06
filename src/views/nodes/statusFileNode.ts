'use strict';
import * as paths from 'path';
import { Command, ThemeIcon, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Commands, DiffWithPreviousCommandArgs } from '../../commands';
import { Container } from '../../container';
import {
    GitFile,
    GitFileWithCommit,
    GitLogCommit,
    GitUri,
    IStatusFormatOptions,
    StatusFileFormatter
} from '../../git/gitService';
import { Strings } from '../../system';
import { View } from '../viewBase';
import { CommitFileNode, CommitFileNodeDisplayAs } from './commitFileNode';
import { ResourceType, ViewNode } from './viewNode';

export class StatusFileNode extends ViewNode {
    private readonly _hasStagedChanges: boolean = false;
    private readonly _hasUnstagedChanges: boolean = false;

    constructor(
        view: View,
        parent: ViewNode,
        public readonly repoPath: string,
        public readonly file: GitFile,
        public readonly commits: GitLogCommit[]
    ) {
        super(GitUri.fromFile(file, repoPath, 'HEAD'), view, parent);

        for (const c of this.commits) {
            if (c.isStagedUncommitted) {
                this._hasStagedChanges = true;
            }
            else if (c.isUncommitted) {
                this._hasUnstagedChanges = true;
            }

            if (this._hasStagedChanges && this._hasUnstagedChanges) break;
        }
    }

    async getChildren(): Promise<ViewNode[]> {
        return this.commits.map(
            c =>
                new CommitFileNode(
                    this.view,
                    this,
                    this.file,
                    c,
                    CommitFileNodeDisplayAs.CommitLabel |
                        (this.view.config.avatars
                            ? CommitFileNodeDisplayAs.Gravatar
                            : CommitFileNodeDisplayAs.CommitIcon)
                )
        );
    }

    async getTreeItem(): Promise<TreeItem> {
        const item = new TreeItem(this.label, TreeItemCollapsibleState.None);

        if ((this._hasStagedChanges || this._hasUnstagedChanges) && this.commits.length === 1) {
            if (this._hasStagedChanges) {
                item.contextValue = ResourceType.FileStaged;
                item.tooltip = StatusFileFormatter.fromTemplate(
                    '${file}\n${directory}/\n\n${status} in Index (staged)',
                    this.file
                );
            }
            else {
                item.contextValue = ResourceType.FileUnstaged;
                item.tooltip = StatusFileFormatter.fromTemplate(
                    '${file}\n${directory}/\n\n${status} in Working Tree',
                    this.file
                );
            }

            // Use the file icon and decorations
            item.resourceUri = GitUri.resolveToUri(this.file.fileName, this.repoPath);
            item.iconPath = ThemeIcon.File;

            item.command = this.getCommand();
        }
        else {
            item.collapsibleState = TreeItemCollapsibleState.Collapsed;
            if (this._hasStagedChanges || this._hasUnstagedChanges) {
                if (this._hasStagedChanges && this._hasUnstagedChanges) {
                    item.contextValue = ResourceType.FileStagedAndUnstaged;
                }
                else if (this._hasStagedChanges) {
                    item.contextValue = ResourceType.FileStaged;
                }
                else {
                    item.contextValue = ResourceType.FileUnstaged;
                }

                // Use the file icon and decorations
                item.resourceUri = GitUri.resolveToUri(this.file.fileName, this.repoPath);
                item.iconPath = ThemeIcon.File;
            }
            else {
                item.contextValue = ResourceType.StatusFileCommits;

                const icon = GitFile.getStatusIcon(this.file.status);
                item.iconPath = {
                    dark: Container.context.asAbsolutePath(paths.join('images', 'dark', icon)),
                    light: Container.context.asAbsolutePath(paths.join('images', 'light', icon))
                };
            }
            item.tooltip = StatusFileFormatter.fromTemplate(
                `\${file}\n\${directory}/\n\n\${status} in ${this.getChangedIn()}`,
                this.file
            );
        }

        // Only cache the label for a single refresh
        this._label = undefined;

        return item;
    }

    private _folderName: string | undefined;
    get folderName() {
        if (this._folderName === undefined) {
            this._folderName = paths.dirname(this.uri.getRelativePath());
        }
        return this._folderName;
    }

    private _label: string | undefined;
    get label() {
        if (this._label === undefined) {
            this._label = StatusFileFormatter.fromTemplate(
                this.view.config.statusFileFormat,
                {
                    ...this.file,
                    commit: this.commit
                } as GitFileWithCommit,
                {
                    relativePath: this.relativePath
                } as IStatusFormatOptions
            );
        }
        return this._label;
    }

    get commit() {
        return this.commits[0];
    }

    get priority(): number {
        if (this._hasStagedChanges && !this._hasUnstagedChanges) return -3;
        if (this._hasStagedChanges) return -2;
        if (this._hasUnstagedChanges) return -1;
        return 0;
    }

    private _relativePath: string | undefined;
    get relativePath(): string | undefined {
        return this._relativePath;
    }
    set relativePath(value: string | undefined) {
        this._relativePath = value;
        this._label = undefined;
    }

    private getChangedIn(): string {
        const changedIn = [];

        let commits = 0;

        if (this._hasUnstagedChanges) {
            commits++;
            changedIn.push('Working Tree');
        }

        if (this._hasStagedChanges) {
            commits++;
            changedIn.push('Index (staged)');
        }

        if (this.commits.length > commits) {
            commits = this.commits.length - commits;
        }

        if (commits > 0) {
            changedIn.push(Strings.pluralize('commit', commits));
        }

        if (changedIn.length > 2) {
            changedIn[changedIn.length - 1] = `and ${changedIn[changedIn.length - 1]}`;
        }
        return changedIn.join(changedIn.length > 2 ? ', ' : ' and ');
    }

    getCommand(): Command | undefined {
        return {
            title: 'Compare File with Previous Revision',
            command: Commands.DiffWithPrevious,
            arguments: [
                GitUri.fromFile(this.file, this.repoPath),
                {
                    commit: this.commit,
                    line: 0,
                    showOptions: {
                        preserveFocus: true,
                        preview: true
                    }
                } as DiffWithPreviousCommandArgs
            ]
        };
    }
}
