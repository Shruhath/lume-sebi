import { Command } from 'commander';

const program = new Command();

program
  .name('lume-sebi')
  .description('Director Change ETL Pipeline — extracts board director events from regulatory PDFs')
  .requiredOption('--input <dir>', 'Input directory containing PDF files')
  .option('--output <file>', 'Output JSON file path', './output.json');

program.parse();

const opts = program.opts<{ input: string; output: string }>();
console.log(`Input: ${opts.input}, Output: ${opts.output}`);
