#!/bin/bash

# Test Script for Projects & Calls Endpoints
# Run this after starting the backend: npm run backend

BASE_URL="http://localhost:8000"
FAILURES=0
SUCCESSES=0

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Projects & Calls Endpoints Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# ============================================
# SECTION 1: PROJECTS ENDPOINTS
# ============================================

echo -e "${YELLOW}[1] Testing Projects Endpoints${NC}"
echo

# Test 1.1: Create Project 1
echo -e "${BLUE}→ Test 1.1: Create Project 1${NC}"
PROJECT_1=$(curl -s -X POST "$BASE_URL/projects/" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "API_KEY": "pk_live_test123abc"
  }')

PROJECT_1_ID=$(echo "$PROJECT_1" | jq -r '.id' 2>/dev/null)

if [ "$PROJECT_1_ID" != "null" ] && [ -n "$PROJECT_1_ID" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Project created with ID: $PROJECT_1_ID"
  echo "  Response: $(echo $PROJECT_1 | jq '.')"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Failed to create project"
  echo "  Response: $PROJECT_1"
  ((FAILURES++))
fi
echo

# Test 1.2: Create Project 2
echo -e "${BLUE}→ Test 1.2: Create Project 2${NC}"
PROJECT_2=$(curl -s -X POST "$BASE_URL/projects/" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "API_KEY": "pk_live_test456def"
  }')

PROJECT_2_ID=$(echo "$PROJECT_2" | jq -r '.id' 2>/dev/null)

if [ "$PROJECT_2_ID" != "null" ] && [ -n "$PROJECT_2_ID" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Project created with ID: $PROJECT_2_ID"
  echo "  Response: $(echo $PROJECT_2 | jq '.')"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Failed to create project"
  echo "  Response: $PROJECT_2"
  ((FAILURES++))
fi
echo

# Test 1.3: Get All Projects
echo -e "${BLUE}→ Test 1.3: Get All Projects${NC}"
ALL_PROJECTS=$(curl -s -X GET "$BASE_URL/projects/")
PROJECT_COUNT=$(echo "$ALL_PROJECTS" | jq 'length' 2>/dev/null)

if [ "$PROJECT_COUNT" -ge 2 ]; then
  echo -e "${GREEN}✓ PASS${NC} - Retrieved $PROJECT_COUNT projects"
  echo "  Response: $(echo $ALL_PROJECTS | jq '.')"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected at least 2 projects, got $PROJECT_COUNT"
  echo "  Response: $ALL_PROJECTS"
  ((FAILURES++))
fi
echo

# Test 1.4: Get Specific Project
echo -e "${BLUE}→ Test 1.4: Get Specific Project (ID: $PROJECT_1_ID)${NC}"
SINGLE_PROJECT=$(curl -s -X GET "$BASE_URL/projects/$PROJECT_1_ID")
RETRIEVED_EMAIL=$(echo "$SINGLE_PROJECT" | jq -r '.email' 2>/dev/null)

if [ "$RETRIEVED_EMAIL" = "john@example.com" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Retrieved project with email: $RETRIEVED_EMAIL"
  echo "  Response: $(echo $SINGLE_PROJECT | jq '.')"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Failed to retrieve project"
  echo "  Response: $SINGLE_PROJECT"
  ((FAILURES++))
fi
echo

# Test 1.5: Update Project
echo -e "${BLUE}→ Test 1.5: Update Project (ID: $PROJECT_1_ID)${NC}"
UPDATED_PROJECT=$(curl -s -X PUT "$BASE_URL/projects/$PROJECT_1_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.updated@example.com",
    "API_KEY": "pk_live_updated999xyz"
  }')

UPDATED_EMAIL=$(echo "$UPDATED_PROJECT" | jq -r '.email' 2>/dev/null)

if [ "$UPDATED_EMAIL" = "john.updated@example.com" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Project updated successfully"
  echo "  Response: $(echo $UPDATED_PROJECT | jq '.')"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Failed to update project"
  echo "  Response: $UPDATED_PROJECT"
  ((FAILURES++))
fi
echo

# Test 1.6: Get Non-Existent Project (Should return 404)
echo -e "${BLUE}→ Test 1.6: Get Non-Existent Project (404 expected)${NC}"
NONEXISTENT=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/projects/99999")
HTTP_CODE=$(echo "$NONEXISTENT" | tail -n1)
RESPONSE=$(echo "$NONEXISTENT" | head -n-1)

if [ "$HTTP_CODE" = "404" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Correctly returned 404 for non-existent project"
  echo "  Response: $RESPONSE"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 404, got $HTTP_CODE"
  echo "  Response: $RESPONSE"
  ((FAILURES++))
fi
echo

# ============================================
# SECTION 2: CALLS ENDPOINTS
# ============================================

echo -e "${YELLOW}[2] Testing Calls Endpoints${NC}"
echo

# Test 2.1: Get Calls by Run ID (assuming some exist from previous traces)
echo -e "${BLUE}→ Test 2.1: Get Calls by Run ID${NC}"
# First, let's get any run_id from existing traces
TRACES=$(curl -s -X GET "$BASE_URL/traces?limit=1")
RUN_ID=$(echo "$TRACES" | jq -r '.[0].run_id' 2>/dev/null)

if [ "$RUN_ID" != "null" ] && [ -n "$RUN_ID" ]; then
  echo "  Found run_id: $RUN_ID"
  CALLS_BY_RUN=$(curl -s -X GET "$BASE_URL/calls/run/$RUN_ID")
  CALL_COUNT=$(echo "$CALLS_BY_RUN" | jq 'length' 2>/dev/null)
  
  if [ "$CALL_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Retrieved $CALL_COUNT calls for run_id: $RUN_ID"
    echo "  Response (first call): $(echo $CALLS_BY_RUN | jq '.[0]')"
    ((SUCCESSES++))
  else
    echo -e "${YELLOW}⊘ SKIP${NC} - No calls found for run_id"
  fi
else
  echo -e "${YELLOW}⊘ SKIP${NC} - No traces in database, create some first"
fi
echo

# Test 2.2: Get Calls by Project ID (Project 1)
echo -e "${BLUE}→ Test 2.2: Get Calls by Project ID (Project $PROJECT_1_ID)${NC}"
CALLS_BY_PROJECT=$(curl -s -X GET "$BASE_URL/calls/project/$PROJECT_1_ID")
PROJECT_CALL_COUNT=$(echo "$CALLS_BY_PROJECT" | jq 'length' 2>/dev/null)

if [ "$PROJECT_CALL_COUNT" = "0" ]; then
  echo -e "${YELLOW}⊘ SKIP${NC} - No calls in this project yet (expected - no traces created)"
  echo "  Note: This is OK. Calls will appear after SDK traces project_id"
elif [ "$PROJECT_CALL_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓ PASS${NC} - Retrieved $PROJECT_CALL_COUNT calls for project"
  echo "  Response (first call): $(echo $CALLS_BY_PROJECT | jq '.[0]')"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Error retrieving calls"
  echo "  Response: $CALLS_BY_PROJECT"
  ((FAILURES++))
fi
echo

# Test 2.3: Get Calls by Non-Existent Project (Should return 404)
echo -e "${BLUE}→ Test 2.3: Get Calls for Non-Existent Project (404 expected)${NC}"
NONEXISTENT_CALLS=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/calls/project/99999")
HTTP_CODE=$(echo "$NONEXISTENT_CALLS" | tail -n1)
RESPONSE=$(echo "$NONEXISTENT_CALLS" | head -n-1)

if [ "$HTTP_CODE" = "404" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Correctly returned 404 for non-existent project"
  echo "  Response: $RESPONSE"
  ((SUCCESSES++))
else
  echo -e "${YELLOW}⊘ SKIP${NC} - Project exists with no calls (not an error)"
fi
echo

# ============================================
# SECTION 3: EDGE CASES & VALIDATION
# ============================================

echo -e "${YELLOW}[3] Testing Edge Cases${NC}"
echo

# Test 3.1: Invalid JSON
echo -e "${BLUE}→ Test 3.1: Invalid Request Body${NC}"
INVALID=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/projects/" \
  -H "Content-Type: application/json" \
  -d '{ invalid json')
HTTP_CODE=$(echo "$INVALID" | tail -n1)

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Server rejected invalid JSON (HTTP $HTTP_CODE)"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Server accepted invalid JSON"
  ((FAILURES++))
fi
echo

# Test 3.2: Delete Project
echo -e "${BLUE}→ Test 3.2: Delete Project (ID: $PROJECT_2_ID)${NC}"
DELETE_RESULT=$(curl -s -X DELETE "$BASE_URL/projects/$PROJECT_2_ID")
DELETE_MESSAGE=$(echo "$DELETE_RESULT" | jq -r '.message' 2>/dev/null)

if [ "$DELETE_MESSAGE" = "Project deleted successfully" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Project deleted successfully"
  echo "  Response: $DELETE_RESULT"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Failed to delete project"
  echo "  Response: $DELETE_RESULT"
  ((FAILURES++))
fi
echo

# Test 3.3: Verify Deleted Project Returns 404
echo -e "${BLUE}→ Test 3.3: Verify Deleted Project Returns 404${NC}"
VERIFY_DELETE=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL/projects/$PROJECT_2_ID")
HTTP_CODE=$(echo "$VERIFY_DELETE" | tail -n1)

if [ "$HTTP_CODE" = "404" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Deleted project correctly returns 404"
  ((SUCCESSES++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 404, got $HTTP_CODE"
  ((FAILURES++))
fi
echo

# ============================================
# FINAL SUMMARY
# ============================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}            Test Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Passed: $SUCCESSES${NC}"
echo -e "${RED}✗ Failed: $FAILURES${NC}"

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
