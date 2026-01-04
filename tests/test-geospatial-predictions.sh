#!/bin/bash

# Test Geospatial Prediction Service
# Tests dynamic operation-based prediction API with OpenRouter LLMs

set -e

MAGEAGENT_URL="${MAGEAGENT_URL:-http://localhost:9080}"
BASE_URL="$MAGEAGENT_URL/mageagent/api/predictions"

echo "=========================================="
echo "Geospatial Prediction Service Test"
echo "=========================================="
echo ""
echo "Base URL: $BASE_URL"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to print test results
print_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASSED${NC}: $2"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAILED${NC}: $2"
    ((TESTS_FAILED++))
  fi
}

echo "=========================================="
echo "Test 1: List Available Operations"
echo "=========================================="
echo ""

RESPONSE=$(curl -s "$BASE_URL")
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.operations.land_use_classification' > /dev/null; then
  print_result 0 "List operations"
else
  print_result 1 "List operations"
fi

echo ""
echo "=========================================="
echo "Test 2: Land Use Classification (Synchronous)"
echo "=========================================="
echo ""

LAND_USE_REQUEST='{
  "operation": "land_use_classification",
  "params": {
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "name": "San Francisco Downtown"
    },
    "imagery": {
      "ndvi": 0.35,
      "landCover": "urban",
      "elevation": 52
    }
  },
  "options": {
    "preferAccuracy": false,
    "stream": false
  }
}'

echo "Request:"
echo "$LAND_USE_REQUEST" | jq '.'
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "$LAND_USE_REQUEST")

echo "Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.result.prediction' > /dev/null; then
  print_result 0 "Land use classification prediction"

  # Extract key fields
  PREDICTION=$(echo "$RESPONSE" | jq -r '.result.prediction')
  CONFIDENCE=$(echo "$RESPONSE" | jq -r '.result.confidence')
  MODEL=$(echo "$RESPONSE" | jq -r '.result.modelUsed')

  echo ""
  echo "  Prediction: $PREDICTION"
  echo "  Confidence: $CONFIDENCE"
  echo "  Model: $MODEL"
else
  print_result 1 "Land use classification prediction"
fi

echo ""
echo "=========================================="
echo "Test 3: Wildfire Risk Assessment"
echo "=========================================="
echo ""

WILDFIRE_REQUEST='{
  "operation": "wildfire_risk_assessment",
  "params": {
    "location": {
      "latitude": 37.8,
      "longitude": -122.4,
      "name": "Oakland Hills"
    },
    "imagery": {
      "ndvi": 0.65,
      "landCover": "forest",
      "elevation": 450
    },
    "timeRange": {
      "start": "2025-06-01",
      "end": "2025-09-30"
    }
  },
  "options": {
    "preferAccuracy": true,
    "stream": false
  }
}'

echo "Request:"
echo "$WILDFIRE_REQUEST" | jq '.'
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "$WILDFIRE_REQUEST")

echo "Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.result.prediction' > /dev/null; then
  print_result 0 "Wildfire risk assessment"

  RISK_LEVEL=$(echo "$RESPONSE" | jq -r '.result.prediction.riskLevel // .result.prediction')
  CONFIDENCE=$(echo "$RESPONSE" | jq -r '.result.confidence')

  echo ""
  echo "  Risk Level: $RISK_LEVEL"
  echo "  Confidence: $CONFIDENCE"
else
  print_result 1 "Wildfire risk assessment"
fi

echo ""
echo "=========================================="
echo "Test 4: Traffic Prediction"
echo "=========================================="
echo ""

TRAFFIC_REQUEST='{
  "operation": "traffic_prediction",
  "params": {
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "name": "SF Bay Bridge"
    },
    "timeRange": {
      "start": "2025-11-05T08:00:00Z",
      "end": "2025-11-05T09:00:00Z"
    },
    "features": {
      "dayOfWeek": "Tuesday",
      "isHoliday": false
    }
  },
  "options": {
    "stream": false
  }
}'

echo "Request:"
echo "$TRAFFIC_REQUEST" | jq '.'
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "$TRAFFIC_REQUEST")

echo "Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.result.prediction' > /dev/null; then
  print_result 0 "Traffic prediction"
else
  print_result 1 "Traffic prediction"
fi

echo ""
echo "=========================================="
echo "Test 5: Custom Prediction"
echo "=========================================="
echo ""

CUSTOM_REQUEST='{
  "operation": "custom",
  "params": {
    "customPrompt": "Analyze the suitability of this rooftop location for solar panel installation. Consider roof area, orientation, and typical weather patterns.",
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194,
      "name": "SF Rooftop"
    },
    "features": {
      "roofArea": 500,
      "orientation": "south",
      "shadeLevel": "minimal",
      "annualSunnyDays": 260
    }
  },
  "options": {
    "preferAccuracy": true,
    "stream": false
  }
}'

echo "Request:"
echo "$CUSTOM_REQUEST" | jq '.'
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "$CUSTOM_REQUEST")

echo "Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.result.prediction' > /dev/null; then
  print_result 0 "Custom solar suitability prediction"
else
  print_result 1 "Custom solar suitability prediction"
fi

echo ""
echo "=========================================="
echo "Test 6: Error Handling - Missing Operation"
echo "=========================================="
echo ""

INVALID_REQUEST='{
  "params": {
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194
    }
  }
}'

RESPONSE=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d "$INVALID_REQUEST")

echo "Response:"
echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.error' | grep -q "Missing required parameter: operation"; then
  print_result 0 "Error handling for missing operation"
else
  print_result 1 "Error handling for missing operation"
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
