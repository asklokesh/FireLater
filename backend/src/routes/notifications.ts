// In the sendWebhook function or equivalent webhook delivery function
const sendWebhook = async (url: string, payload: any, options: { attempts?: number; backoff?: { type: string; delay: number } } = {}) => {
  const { attempts = 3, backoff = { type: 'exponential', delay: 1000 } } = options;
  
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        return response;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      const isLastAttempt = attempt === attempts;
      
      if (isLastAttempt) {
        throw error;
      }
      
      // Calculate delay based on backoff strategy
      let delay = backoff.delay;
      if (backoff.type === 'exponential') {
        delay = backoff.delay * Math.pow(2, attempt - 1);
      }
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
};