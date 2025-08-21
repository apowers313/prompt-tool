import chalk from 'chalk';
import { ConfigManager } from '../config/config-manager.js';
import { HistoryManager } from '../history/history-manager.js';
import { HistoryEntry } from '../types/history.js';
import { errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import Handlebars from 'handlebars';
import path from 'node:path';
import fs from 'fs-extra';

interface HistoryOptions {
  limit?: number;
  all?: boolean;
  entry?: number;
  result?: number;
}

export async function historyCommand(options: HistoryOptions): Promise<void> {
  // Load config
  const config = await ConfigManager.load();
  
  // Check if history is enabled
  if (!config.historyDir) {
    throw errors.featureNotEnabled('History tracking', [
      'Track all your prompts',
      'Re-run previous prompts',
      'Add annotations'
    ]);
  }

  // Create history manager
  const historyManager = new HistoryManager(config.historyDir);

  // If --result is specified, show entry with its output
  if (options.result !== undefined) {
    const entry = await historyManager.getHistoryEntry(options.result);
    
    if (!entry) {
      logger.log(chalk.red(`History entry ${options.result} not found`));
      const totalCount = await historyManager.getTotalCount();
      if (totalCount > 0) {
        logger.log(chalk.dim(`Available entries: 1-${totalCount}`));
      }
      return;
    }

    // Display full entry details
    logger.log(chalk.bold(`\nHistory Entry #${options.result}:`));
    logger.log(chalk.gray('─'.repeat(80)));
    
    logger.log(chalk.cyan('Timestamp:') + ` ${formatDate(entry.timestamp)}`);
    logger.log(chalk.cyan('Title:') + ` ${entry.title || 'Untitled'}`);
    logger.log(chalk.cyan('Template:') + ` ${entry.templatePath}`);
    
    if (Object.keys(entry.variables).length > 0) {
      logger.log(chalk.cyan('\nVariables:'));
      for (const [key, value] of Object.entries(entry.variables)) {
        logger.log(`  ${chalk.green(key)}: ${JSON.stringify(value)}`);
      }
    }
    
    logger.log(chalk.cyan('\nFinal Prompt:'));
    logger.log(chalk.gray('─'.repeat(80)));
    logger.log(entry.finalPrompt);
    logger.log(chalk.gray('─'.repeat(80)));
    
    // Check if output file exists and display it
    if (entry.execution?.output_file) {
      const outputPath = path.join(config.historyDir, entry.execution.output_file as string);
      
      try {
        const outputContent = await fs.readFile(outputPath, 'utf-8');
        logger.log(chalk.cyan('\nCommand Output:'));
        logger.log(chalk.gray('─'.repeat(80)));
        logger.log(outputContent);
        logger.log(chalk.gray('─'.repeat(80)));
      } catch {
        logger.log(chalk.yellow('\nOutput file not found or inaccessible'));
      }
    } else {
      logger.log(chalk.dim('\nNo output file associated with this entry'));
    }
    
    logger.log(chalk.dim(`\nHistory file: ${entry.filename}`));
    return;
  }

  // If a specific entry is requested, show its full content
  if (options.entry !== undefined) {
    const entry = await historyManager.getHistoryEntry(options.entry);
    
    if (!entry) {
      logger.log(chalk.red(`History entry ${options.entry} not found`));
      const totalCount = await historyManager.getTotalCount();
      if (totalCount > 0) {
        logger.log(chalk.dim(`Available entries: 1-${totalCount}`));
      }
      return;
    }

    // Display full entry details
    logger.log(chalk.bold(`\nHistory Entry #${options.entry}:`));
    logger.log(chalk.gray('─'.repeat(80)));
    
    logger.log(chalk.cyan('Timestamp:') + ` ${formatDate(entry.timestamp)}`);
    logger.log(chalk.cyan('Title:') + ` ${entry.title || 'Untitled'}`);
    logger.log(chalk.cyan('Template:') + ` ${entry.templatePath}`);
    
    if (Object.keys(entry.variables).length > 0) {
      logger.log(chalk.cyan('\nVariables:'));
      for (const [key, value] of Object.entries(entry.variables)) {
        logger.log(`  ${chalk.green(key)}: ${JSON.stringify(value)}`);
      }
    }
    
    logger.log(chalk.cyan('\nFinal Prompt:'));
    logger.log(chalk.gray('─'.repeat(80)));
    logger.log(entry.finalPrompt);
    logger.log(chalk.gray('─'.repeat(80)));
    
    logger.log(chalk.dim(`\nHistory file: ${entry.filename}`));
    return;
  }

  // Determine limit
  let limit: number | undefined;
  if (options.all) {
    limit = undefined;
  } else if (options.limit) {
    limit = options.limit;
  } else {
    limit = 20; // Default limit
  }

  // Get total count of entries for proper numbering
  const totalCount = await historyManager.getTotalCount();
  
  // Get history entries
  const entries = await historyManager.listHistory(limit);

  // Handle empty history
  if (entries.length === 0) {
    logger.log(chalk.yellow('📋 No history found'));
    logger.log(chalk.dim('\nRun some prompts to build your history:'));
    logger.log(chalk.dim('  • pt                  - Interactive prompt selection'));
    logger.log(chalk.dim('  • pt run <tool>       - Run with specific tool'));
    logger.log(chalk.dim('  • pt run              - Run with default tool'));
    return;
  }

  // Display header
  logger.log(chalk.bold('\nPrompt History:'));
  logger.log(chalk.gray('─'.repeat(80)));

  // Calculate starting number based on total count and entries shown
  const startNum = totalCount - entries.length + 1;

  // Display entries
  entries.forEach((entry, index) => {
    const num = startNum + index;
    const date = formatDate(entry.timestamp);
    const title = entry.title || 'Untitled';
    const summary = createAutoSummary(entry);

    logger.log(chalk.cyan(`${num}.`) + chalk.gray(` [${date}] `) + chalk.white(title));
    logger.log('   ' + chalk.gray(summary));
    logger.log('');
  });
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  // Use local time methods to display in user's timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function processSummaryTemplate(summary: string, variables: Record<string, unknown>): string {
  try {
    const template = Handlebars.compile(summary);
    return template(variables);
  } catch {
    // If template processing fails, return the raw summary
    return summary;
  }
}

function formatVariables(variables: Record<string, unknown>): string[] {
  const formatted: string[] = [];
  
  // Skip masked values and empty objects
  const entries = Object.entries(variables).filter(([_, value]) => 
    value !== '***' && value !== undefined && value !== null && value !== ''
  );
  
  // Format each variable based on its type
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      // First, normalize the string by collapsing multiple spaces/newlines but preserving structure
      // Replace multiple newlines with a space, but keep single spaces
      const normalized = value
        .replace(/\n+/g, ' ')  // Replace newlines with spaces
        .replace(/\s{2,}/g, ' ')  // Replace multiple spaces with single space
        .trim();
      
      // Check if this variable is a file-related input based on its name
      const isFileVariable = key.toLowerCase().includes('file') || 
                           key.toLowerCase().includes('path') ||
                           key.toLowerCase().includes('dir');
      
      if (isFileVariable && (normalized.includes('/') || normalized.includes('\\'))) {
        // For file variables, show just the filename
        const filename = normalized.split(/[/\\]/).pop() || normalized;
        formatted.push(`${key}: "${filename}"`);
      } else {
        // Escape any quotes in the string to prevent display issues
        const escaped = normalized.replace(/"/g, '\\"');
        // Don't truncate individual variables here - let createAutoSummary handle it
        formatted.push(`${key}: "${escaped}"`);
      }
    } else if (typeof value === 'boolean') {
      formatted.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      formatted.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      formatted.push(`${key}: [${value.length} items]`);
    } else if (typeof value === 'object') {
      formatted.push(`${key}: {...}`);
    } else {
      formatted.push(`${key}: ${String(value)}`);
    }
  }
  
  return formatted;
}

function createAutoSummary(entry: HistoryEntry): string {
  // Account for 3 spaces of indentation in the display
  const maxSummaryLength = 77; // 80 - 3 spaces
  
  let summary: string;
  
  // If there's a summary field, use it
  if (entry.summary) {
    summary = processSummaryTemplate(entry.summary, entry.variables);
  } else {
    // Otherwise, show the most relevant user inputs
    const varDisplay = formatVariables(entry.variables);
    
    if (varDisplay.length > 0) {
      // Show up to 2 variables in a concise format
      summary = varDisplay.slice(0, 2).join(', ');
    } else {
      // Fall back to showing a truncated version of the prompt
      summary = entry.finalPrompt.split('\n')[0].trim();
    }
  }
  
  // Ensure consistent truncation for alignment
  if (summary.length > maxSummaryLength) {
    return summary.substring(0, maxSummaryLength - 3) + '...';
  }
  return summary;
}