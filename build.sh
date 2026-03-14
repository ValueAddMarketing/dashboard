#!/bin/sh
rm -rf dist
mkdir -p dist/client-portal dist/george dist/billing-errors dist/billing
cp index.html dashboard.html dist/
cp client-portal/index.html dist/client-portal/index.html
cp george/index.html dist/george/index.html
cp billing-errors/index.html dist/billing-errors/index.html
cp billing/index.html dist/billing/index.html
cp whop-members.csv dist/whop-members.csv
