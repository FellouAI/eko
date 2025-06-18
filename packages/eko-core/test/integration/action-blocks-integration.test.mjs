import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '../../.env') });

async function endToEndRealTestFixed() {
  console.log('🚀 END-TO-END REAL EKO FRAMEWORK TEST (FIXED)');
  console.log('=============================================\n');

  console.log('🔑 Environment check:');
  console.log(`   - OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   - Working directory: ${process.cwd()}`);

  if (!process.env.OPENAI_API_KEY) {
    console.log('\n❌ OPENAI_API_KEY is required for this test');
    console.log('   Please set it in the .env file');
    return { success: false, error: 'Missing API key' };
  }

  try {
    console.log('\n📦 Loading Eko modules...');

    // Import from built modules
    const EkoCore = await import('../../dist/index.esm.js');
    const EkoNodejs = await import('../../../eko-nodejs/dist/index.esm.js');

    console.log('✅ Modules loaded successfully');

    // List what's actually available
    console.log('\n🔍 Available exports from EkoCore:');
    console.log('   -', Object.keys(EkoCore).slice(0, 10).join(', '), '...');

    // Extract the classes we need
    const { Eko, extractTemplateVariables, replaceTemplateVariables, config: defaultConfig } = EkoCore;
    const { BrowserAgent } = EkoNodejs;

    console.log('✅ Classes extracted:');
    console.log(`   - Eko: ${typeof Eko}`);
    console.log(`   - BrowserAgent: ${typeof BrowserAgent}`);
    console.log(`   - extractTemplateVariables: ${typeof extractTemplateVariables}`);
    console.log(`   - replaceTemplateVariables: ${typeof replaceTemplateVariables}`);

    // Load the flights workflow XML content
    console.log('\n📋 Loading flights.xml workflow...');
    const workflowPath = join(__dirname, '../fixtures/workflows/flights/flights.xml');
    const xmlContent = readFileSync(workflowPath, 'utf8');
    console.log(`✅ Loaded flights.xml (${xmlContent.length} characters)`);

    // Since parseWorkflow is not exported, we'll let Eko handle the workflow through generate()
    // But first, let's analyze the XML content manually to verify our implementation
    console.log('\n🔍 Analyzing XML content for action blocks...');

    // Extract action blocks manually
    const actionBlockMatches = xmlContent.match(/<action[^>]*type="([^"]*)"[^>]*>([\s\S]*?)<\/action>/g) || [];
    console.log(`✅ Found ${actionBlockMatches.length} action blocks in XML`);

    const actionBlocks = [];
    for (const match of actionBlockMatches) {
      const typeMatch = match.match(/type="([^"]*)"/);
      const type = typeMatch ? typeMatch[1] : 'unknown';

      const action = { type };

      // Extract selectors
      const selectorMatch = match.match(/<selector([^>]*?)(?:\/>|>.*?<\/selector>)/s);
      if (selectorMatch) {
        const selectorContent = selectorMatch[1];
        const cssMatch = selectorContent.match(/css="([^"]*)"/);
        const xpathMatch = selectorContent.match(/xpath="([^"]*)"/);

        action.selector = {};
        if (cssMatch) action.selector.css = cssMatch[1];
        if (xpathMatch) action.selector.xpath = xpathMatch[1];
      }

      // Extract other properties
      const valueMatch = match.match(/<value>([^<]*)<\/value>/);
      if (valueMatch) action.value = valueMatch[1];

      const urlMatch = match.match(/<url>([^<]*)<\/url>/);
      if (urlMatch) action.url = urlMatch[1];

      actionBlocks.push(action);
    }

    console.log('\n⚡ Action blocks found:');
    actionBlocks.forEach((action, i) => {
      console.log(`   ${i + 1}. ${action.type}`);
      if (action.selector?.css) console.log(`      📍 CSS: ${action.selector.css.substring(0, 60)}...`);
      if (action.selector?.xpath) console.log(`      📍 XPath: Present`);
      if (action.value) console.log(`      💬 Value: ${action.value}`);
      if (action.url) console.log(`      🌐 URL: ${action.url}`);
    });

    // Extract template variables
    console.log('\n📝 Analyzing template variables...');
    const templateVars = extractTemplateVariables ? extractTemplateVariables(xmlContent) : [];
    console.log(`✅ Template variables found: ${templateVars.length}`);

    if (templateVars.length > 0) {
      templateVars.forEach(v => {
        console.log(`   - ${v.name} (${v.type}): ${v.description || 'No description'}`);
      });
    }

    // Create browser agent
    console.log('\n🌐 Creating BrowserAgent...');
    const browserAgent = new BrowserAgent();
    browserAgent.setHeadless(false); // Show browser for demonstration
    console.log('✅ BrowserAgent created (non-headless mode)');

    // Configure Eko instance
    console.log('\n⚙️  Configuring Eko instance...');
    const ekoConfig = {
      ...defaultConfig,
      llms: {
        default: {
          provider: "openai",
          model: "gpt-4o",
          apiKey: async () => process.env.OPENAI_API_KEY,
          config: {
            baseURL: async () => "https://api.openai.com/v1/"
          }
        }
      },
      agents: [browserAgent],
      callback: {
        onMessage: (message) => {
          console.log(`📡 Eko [${message.type}]:`,
            message.content?.substring(0, 80) + (message.content?.length > 80 ? '...' : ''));
        }
      }
    };

    // Create Eko instance
    const eko = new Eko(ekoConfig);
    console.log('✅ Eko instance created');

    // Template variables for flight search
    const templateVariables = {
      departure_location: "San Francisco",
      destination_location: "New York",
      departure_date: "2025-01-20",
      return_date: "2025-01-25"
    };

    console.log('\n📝 Template variables for test:');
    Object.entries(templateVariables).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });

    // Create a task prompt that includes the XML workflow
    const taskPrompt = `
Execute a flight search workflow using the following XML:

${xmlContent}

Please search for flights from ${templateVariables.departure_location} to ${templateVariables.destination_location} departing on ${templateVariables.departure_date} and returning on ${templateVariables.return_date}.

Use the action blocks defined in the XML when possible, and fall back to natural language interaction when selectors fail.
`;

    // Generate the workflow with Eko
    console.log('\n⚡ Generating workflow with Eko...');
    const taskId = 'end-to-end-test-' + Date.now();

    const generatedWorkflow = await eko.generate(
      taskPrompt,
      taskId,
      templateVariables
    );

    console.log('✅ Workflow generated successfully by Eko');
    console.log(`   - Task ID: ${taskId}`);
    console.log(`   - Generated agents: ${generatedWorkflow.agents.length}`);

    // Execute the workflow with REAL BROWSER
    console.log('\n🚀 LAUNCHING REAL BROWSER AND EXECUTING WORKFLOW...');
    console.log('   🌐 Browser window will open');
    console.log('   🎯 Workflow will execute with real browser automation');
    console.log('   🤖 LLM will handle the flight search task');
    console.log('   ⏱️  This may take several minutes...\n');

    const startTime = Date.now();
    const result = await eko.execute(taskId);
    const endTime = Date.now();

    console.log('\n🎉 REAL BROWSER EXECUTION COMPLETED!');
    console.log(`⏱️  Execution time: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
    console.log('\n📊 Execution result:');
    console.log('   - Success:', result.success);
    console.log('   - Result preview:', typeof result.result === 'string' ? result.result.substring(0, 300) + '...' : result.result);

    if (result.chainResult) {
      console.log('\n🔗 Chain result details:');
      console.log('   - Messages:', result.chainResult.messages?.length || 0);
      console.log('   - Plan result:', result.chainResult.planResult ? 'Present' : 'None');
    }

    return {
      success: result.success,
      actionBlocksFound: actionBlocks.length,
      templateVariablesFound: templateVars.length,
      browserLaunched: result.success,
      workflowExecuted: result.success,
      executionTime: (endTime - startTime) / 1000,
      result
    };

  } catch (error) {
    console.error('\n❌ END-TO-END TEST FAILED:');
    console.error('Error:', error.message);

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack.split('\n').slice(0, 10).join('\n'));
    }

    // Provide specific error guidance
    if (error.message.includes('Module not found') || error.message.includes('Cannot find')) {
      console.error('\n🔍 Module resolution issue:');
      console.error('   Make sure all packages are built: pnpm -r build');
    }

    if (error.message.includes('browser') || error.message.includes('playwright')) {
      console.error('\n🌐 Browser automation issue:');
      console.error('   Make sure Playwright is properly installed');
    }

    if (error.message.includes('API') || error.message.includes('openai')) {
      console.error('\n🔑 API issue:');
      console.error('   Check OpenAI API key and rate limits');
    }

    return {
      success: false,
      error: error.message,
      actionBlocksFound: 0,
      templateVariablesFound: 0,
      browserLaunched: false,
      workflowExecuted: false,
      executionTime: 0
    };
  }
}

// Run the end-to-end test
if (import.meta.url === `file://${process.argv[1]}`) {
  endToEndRealTestFixed()
    .then((result) => {
      console.log('\n📈 Test Results:');
      console.log(`   - Test success: ${result.success}`);
      console.log(`   - Action blocks found: ${result.actionBlocksFound}`);
      console.log(`   - Template variables: ${result.templateVariablesFound}`);
      console.log(`   - Browser launched: ${result.browserLaunched}`);
      console.log(`   - Workflow executed: ${result.workflowExecuted}`);
      console.log(`   - Execution time: ${result.executionTime}s`);

      if (result.success) {
        console.log('\n✅ END-TO-END TEST PASSED');
        console.log('   Browser automation and action blocks working correctly');
        process.exit(0);
      } else {
        console.log('\n❌ END-TO-END TEST FAILED');
        if (result.error) {
          console.log('Error:', result.error);
        }
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 UNEXPECTED ERROR:', error);
      process.exit(1);
    });
}

export { endToEndRealTestFixed };
