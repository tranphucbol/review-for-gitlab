import { readFileSync } from 'fs';
import { join } from 'path';
import { USER_COMMANDS } from './command_names';
import * as packageJson from '../../desktop.package.json';

describe('user commands', () => {
  it('should match exactly commands defined in package.json', () => {
    const packageJsonCommands = packageJson.contributes.commands.map(c => c.command);
    const constantCommands = Object.values(USER_COMMANDS);
    expect(packageJsonCommands.sort()).toEqual(constantCommands.sort());
  });

  // JSON keeps only the last of two equal keys, so a second menu location would drop the first.
  it('declares each menu location once', () => {
    const text = readFileSync(join(__dirname, '../../desktop.package.json'), 'utf8');
    const menus = text.slice(text.indexOf('"menus": {'), text.indexOf('"viewsContainers": {'));
    const locations = (menus.match(/^ {6}"[^"]+": \[/gm) ?? []).map(line => line.trim());

    expect(locations.length).toBeGreaterThan(0);
    expect(locations).toEqual([...new Set(locations)]);
  });
});
