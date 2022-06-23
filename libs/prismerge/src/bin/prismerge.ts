#!/usr/bin/env node

import * as command from 'commander';
import * as process from 'process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path = require('path');
import * as fs from 'fs';
import { warningString } from './../ui/warning';
import { prismergeFileStub } from './../ui/prismerge.stub';
import { exit } from 'process';
import { glob } from 'glob';

const mixer = (schemaString: string) => {
  // Schemas lines are split by newline
  const schemaArray = schemaString.split('\n').filter((item) => !!item);

  // Cache
  const prismaAtrributes = {};

  // ex model, enum, etc
  let operatorKey = '';
  // ex User, RoleType, etc
  let operatorName = '';

  // Iterate line by line
  for (const item of schemaArray) {
    if (item.includes('{')) {
      const [key, name] = item.replace('{', '').trim().split(' ');

      operatorKey = key.trim();
      operatorName = name.trim();

      if (!prismaAtrributes[operatorKey]) {
        prismaAtrributes[operatorKey] = {};
      }

      if (!prismaAtrributes[operatorKey][operatorName]) {
        prismaAtrributes[operatorKey][operatorName] = [];
      }

      continue;
    }

    if (item.includes('}')) {
      continue;
    }

    prismaAtrributes[operatorKey][operatorName].push(item);
  }

  let prismaSchema = warningString; // warning

  for (const optType in prismaAtrributes) {
    if (Object.prototype.hasOwnProperty.call(prismaAtrributes, optType)) {
      const optObj = prismaAtrributes[optType];
      for (const optName in optObj) {
        if (Object.prototype.hasOwnProperty.call(optObj, optName)) {
          const lines = optObj[optName];
          const string = `${optType} ${optName} {\n${lines.join('\n')}\n}\n`;
          prismaSchema = prismaSchema + string;
        }
      }
    }
  }

  return prismaSchema;
};

const bootstrap = () => {
  command.program
    .version(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../package.json').version,
      '-v, --version',
      'Output the current version.',
    )
    .description(
      'Merge all defined prisma *.schema files into one big prisma.schema file.',
    )
    .option(
      '-i, --input <path>',
      'Path to the PrisMerge File, relative to the current working directory.',
      './prismerge.json',
    )
    .option('-g, --generate', 'Generate a default file first.')
    .option('-nF, --no-format', 'Format the Prisma File after generation.')
    .parse(process.argv);

  const options = command.program.opts();

  const basePath = path.join(process.cwd());
  const inputPath = path.join(basePath, options.input);

  // check, if we need to generate the prismerge file
  if (options.generate) {
    if (!existsSync(inputPath)) {
      fs.writeFileSync(inputPath, JSON.stringify(prismergeFileStub), {
        encoding: 'utf-8',
      });
      console.log(
        `File ${inputPath} was successfully created; exiting PrisMerge!`,
      );
      exit(0);
    } else {
      console.log(`File ${inputPath} does already exist; exiting PrisMerge!`);
      exit(1);
    }
  }

  if (!existsSync(inputPath)) {
    console.log(`Cannot read file ${inputPath}; exiting PrisMerge!`);
    exit(1);
  }

  // now we have everything ready
  const prisMergeContent = JSON.parse(readFileSync(inputPath, 'utf8'));

  Object.entries(prisMergeContent).forEach(
    ([app, content]: [
      string,
      Record<string, string | object | Array<string>>,
    ]) => {
      console.log(`Processing app: ${app}...`);
      const prismaSchemaInputFiles = (content.inputs || []) as Array<string>;
      const prismaSchemaMixinFiles = content.mixins || {};
      const prismaSchemaOutputFile = content.output;

      let prismaContent = '';

      prismaSchemaInputFiles.forEach((schemaEntry: string) => {
        const schemaFilePaths = glob.sync(schemaEntry);

        console.log('>>>>>>> schemaFilePaths', schemaFilePaths);

        schemaFilePaths.forEach((schemaFilePath: string) => {
          const content = readFileSync(schemaFilePath, 'utf8');
          prismaContent = prismaContent + content;
        });
      });

      Object.entries(prismaSchemaMixinFiles).forEach(([key, filePath]) => {
        // find key and replace with content from value
        const content = readFileSync(filePath as string, 'utf8');
        const regEx = new RegExp(`__${key}__`, 'g');
        prismaContent = prismaContent.replace(regEx, content);
      });

      // ACA
      const mixedSchema = mixer(prismaContent);
      writeFileSync(prismaSchemaOutputFile as string, mixedSchema, {
        encoding: 'utf8',
      });

      if (options.format) {
        console.log(`Formatting file ${content.output}`);
        execSync(`npx prisma format --schema=${prismaSchemaOutputFile}`);
      }

      console.log(`Done processing app ${app}`);
    },
  );
};

bootstrap();
