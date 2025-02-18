// server/services/transactionService.js
// server/services/transactionService.js
import { ethers } from "ethers";
import HealthData from "../models/HealthData.js";
import hipaaCompliance from "../middleware/hipaaCompliance.js";
import { AUDIT_TYPES, NETWORK_CONFIG } from "../constants/index.js";
import dotenv from "dotenv";
import { createRequire } from "module";

// Load environment variables
dotenv.config();

// Debug logs for troubleshooting
console.log("✅ Loaded ENV Variables:", JSON.stringify(process.env, null, 2));
console.log("✅ NETWORK_CONFIG:", JSON.stringify(NETWORK_CONFIG, null, 2));

const require = createRequire(import.meta.url);
const contractJson = require("../../client/src/contracts/HealthDataMarketplace.json");
const contractABI = contractJson.abi;

class TransactionServiceError extends Error {
  constructor(message, code = "TRANSACTION_ERROR", details = {}) {
    super(message);
    this.name = "TransactionServiceError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }
}

class TransactionService {
  constructor() {
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 1000; // 1 second
    this.initializeProvider();
  }

  // Initialize provider and contract
  initializeProvider() {
    try {
      // Ensure SEPOLIA RPC URL is retrieved correctly
      const rpcUrl =
        process.env.SEPOLIA_RPC_URL || NETWORK_CONFIG?.SEPOLIA?.RPC_URL;

      if (!rpcUrl) {
        throw new TransactionServiceError(
          "RPC URL is missing. Check your .env file or NETWORK_CONFIG.",
          "MISSING_RPC_URL"
        );
      }

      // Use the correct Ethers.js v6 provider initialization
      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      if (!this.provider) {
        throw new TransactionServiceError(
          "Failed to initialize JsonRpcProvider",
          "PROVIDER_INITIALIZATION_ERROR"
        );
      }

      console.log("✅ Provider successfully initialized:", rpcUrl);

      this.contract = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        contractABI,
        this.provider
      );

      this.setupEventListeners();
    } catch (error) {
      console.error("❌ Provider initialization error:", error.message);
      throw new TransactionServiceError(
        "Failed to initialize provider",
        "INITIALIZATION_ERROR",
        { originalError: error.message }
      );
    }
  }

  async retryOperation(operation, maxRetries = this.MAX_RETRIES) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.RETRY_DELAY * attempt)
          );
        }
      }
    }
    throw lastError;
  }

  setupEventListeners() {
    this.provider.on("block", (blockNumber) => {
      console.log("New block:", blockNumber);
    });

    this.contract.on("DataPurchased", (id, buyer, seller, price, event) => {
      console.log("Data purchased:", {
        id: id.toString(),
        buyer,
        seller,
        price: ethers.utils.formatEther(price),
        transactionHash: event.transactionHash,
      });
    });
  }
}

const transactionService = new TransactionService();
export default transactionService;
